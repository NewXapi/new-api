package marketplace

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"image/png"
	"io"
	"strings"

	"github.com/QuantumNous/new-api/internal/common"
)

const (
	FormatCharacterCardJSON = "character_card_json"
	FormatCharacterCardPNG  = "character_card_png"
	FormatTutorialMarkdown  = "tutorial_markdown"

	maxPNGDimension         = 4096
	maxPNGPixels            = 16 * 1024 * 1024
	maxPNGTextChunkBytes    = 8 << 20
	maxPNGTextInflatedBytes = 8 << 20
	maxPNGInflatedBytes     = 64 << 20
	maxPNGChunks            = 4096
)

var (
	errUnsupportedCharacterCard = errors.New("unsupported character card format")
	errInvalidTutorialMarkdown  = errors.New("invalid tutorial markdown")
)

// CharacterCard retains the complete decoded source map, including unknown
// fields, for format-preserving exports and configurable mobile field mapping.
type CharacterCard struct {
	Raw map[string]any
}

func ValidateTutorialMarkdown(content string) error {
	if strings.TrimSpace(content) == "" {
		return errInvalidTutorialMarkdown
	}
	// Only prose is validated; fenced code blocks (``` ... ```) may legitimately
	// contain angle brackets. An unterminated fence runs to the end of the
	// document, matching the CommonMark rendering behaviour.
	segments := strings.Split(content, "```")
	for i, segment := range segments {
		if i%2 == 1 {
			continue
		}
		for _, line := range strings.Split(segment, "\n") {
			trimmed := strings.TrimSpace(line)
			lower := strings.ToLower(trimmed)
			if strings.Contains(lower, "![") || strings.Contains(lower, "<img") || strings.Contains(lower, "<iframe") ||
				strings.Contains(lower, "<object") || strings.Contains(lower, "<embed") ||
				strings.Contains(lower, "<script") || strings.Contains(lower, "</") {
				return errInvalidTutorialMarkdown
			}
			if strings.HasPrefix(trimmed, "<") && strings.Contains(trimmed, ">") {
				return errInvalidTutorialMarkdown
			}
			if strings.Contains(lower, "](data:image/") || strings.Contains(lower, "<data:image/") {
				return errInvalidTutorialMarkdown
			}
		}
	}
	return nil
}

func NormalizeCharacterCardJSON(data []byte) ([]byte, CharacterCard, error) {
	var raw map[string]any
	if err := common.Unmarshal(data, &raw); err != nil {
		return nil, CharacterCard{}, fmt.Errorf("decode character card JSON: %w", err)
	}
	if !looksLikeCharacterCard(raw) {
		return nil, CharacterCard{}, errUnsupportedCharacterCard
	}
	normalized, err := common.Marshal(raw)
	if err != nil {
		return nil, CharacterCard{}, fmt.Errorf("normalize character card JSON: %w", err)
	}
	return normalized, CharacterCard{Raw: raw}, nil
}

func looksLikeCharacterCard(raw map[string]any) bool {
	if spec, ok := raw["spec"].(string); ok && spec != "" {
		if spec != "chara_card_v2" && spec != "chara_card_v3" {
			return false
		}
		data, ok := raw["data"].(map[string]any)
		if !ok {
			return false
		}
		_, hasName := data["name"]
		_, hasDescription := data["description"]
		return hasName && hasDescription
	}
	_, hasName := raw["name"]
	_, hasDescription := raw["description"]
	return hasName && hasDescription
}

type pngChunk struct {
	Type [4]byte
	Data []byte
}

var pngSignature = []byte{137, 80, 78, 71, 13, 10, 26, 10}

func parsePNGChunks(data []byte) ([]pngChunk, error) {
	if len(data) < len(pngSignature) || !bytes.Equal(data[:len(pngSignature)], pngSignature) {
		return nil, errUnsupportedCharacterCard
	}
	reader := bytes.NewReader(data[len(pngSignature):])
	chunks := make([]pngChunk, 0, 16)
	seenIHDR, seenIDAT, endedIDAT := false, false, false
	for reader.Len() > 0 {
		if len(chunks) >= maxPNGChunks || reader.Len() < 12 {
			return nil, errUnsupportedCharacterCard
		}
		var length uint32
		if err := binary.Read(reader, binary.BigEndian, &length); err != nil || uint64(length)+8 > uint64(reader.Len()) {
			return nil, errUnsupportedCharacterCard
		}
		var typ [4]byte
		if _, err := io.ReadFull(reader, typ[:]); err != nil {
			return nil, errUnsupportedCharacterCard
		}
		name := string(typ[:])
		if !validPNGChunkType(typ) || name == "IHDR" && (seenIHDR || len(chunks) != 0) || !seenIHDR && name != "IHDR" {
			return nil, errUnsupportedCharacterCard
		}
		if (name == "tEXt" || name == "zTXt" || name == "iTXt") && length > maxPNGTextChunkBytes {
			return nil, errors.New("PNG text chunk exceeds limit")
		}
		chunkData := make([]byte, int(length))
		if _, err := io.ReadFull(reader, chunkData); err != nil {
			return nil, errUnsupportedCharacterCard
		}
		var crcBytes [4]byte
		if _, err := io.ReadFull(reader, crcBytes[:]); err != nil {
			return nil, errUnsupportedCharacterCard
		}
		if binary.BigEndian.Uint32(crcBytes[:]) != crc32.ChecksumIEEE(append(append([]byte(nil), typ[:]...), chunkData...)) {
			return nil, errors.New("invalid PNG chunk checksum")
		}
		switch name {
		case "IHDR":
			if length != 13 || !validPNGHeader(chunkData) {
				return nil, errors.New("invalid or unsupported PNG header")
			}
			seenIHDR = true
		case "IDAT":
			if endedIDAT {
				return nil, errors.New("non-consecutive PNG IDAT chunks")
			}
			seenIDAT = true
		default:
			if seenIDAT {
				endedIDAT = true
			}
		}
		chunks = append(chunks, pngChunk{Type: typ, Data: chunkData})
		if name == "IEND" {
			if length != 0 || reader.Len() != 0 || !seenIDAT {
				return nil, errUnsupportedCharacterCard
			}
			break
		}
	}
	if len(chunks) == 0 || string(chunks[len(chunks)-1].Type[:]) != "IEND" {
		return nil, errUnsupportedCharacterCard
	}
	return chunks, nil
}

func validPNGChunkType(typ [4]byte) bool {
	for _, char := range typ {
		if !(char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z') {
			return false
		}
	}
	return typ[2] >= 'A' && typ[2] <= 'Z'
}

func validPNGHeader(data []byte) bool {
	width := binary.BigEndian.Uint32(data[:4])
	height := binary.BigEndian.Uint32(data[4:8])
	if width == 0 || height == 0 || width > maxPNGDimension || height > maxPNGDimension || uint64(width)*uint64(height) > maxPNGPixels {
		return false
	}
	bitDepth, colorType, compression, filter, interlace := data[8], data[9], data[10], data[11], data[12]
	validDepth := false
	switch colorType {
	case 0:
		validDepth = bitDepth == 1 || bitDepth == 2 || bitDepth == 4 || bitDepth == 8 || bitDepth == 16
	case 2, 4, 6:
		validDepth = bitDepth == 8 || bitDepth == 16
	case 3:
		validDepth = bitDepth == 1 || bitDepth == 2 || bitDepth == 4 || bitDepth == 8
	default:
		return false
	}
	return validDepth && compression == 0 && filter == 0 && (interlace == 0 || interlace == 1)
}

func sanitizePNGChunks(chunks []pngChunk) ([]pngChunk, error) {
	result := make([]pngChunk, 0, len(chunks))
	for _, chunk := range chunks {
		name := string(chunk.Type[:])
		switch name {
		case "IHDR", "IDAT", "IEND":
			result = append(result, chunk)
		case "tEXt", "zTXt", "iTXt":
			key, _, ok, err := decodePNGTextChunk(name, chunk.Data)
			if err != nil {
				return nil, err
			}
			if ok && isCharacterCardKey(key) {
				result = append(result, chunk)
			}
		}
	}
	return result, nil
}

func encodePNGChunk(chunk pngChunk) []byte {
	result := make([]byte, 12+len(chunk.Data))
	binary.BigEndian.PutUint32(result[:4], uint32(len(chunk.Data)))
	copy(result[4:8], chunk.Type[:])
	copy(result[8:8+len(chunk.Data)], chunk.Data)
	crc := crc32.ChecksumIEEE(result[4 : 8+len(chunk.Data)])
	binary.BigEndian.PutUint32(result[8+len(chunk.Data):], crc)
	return result
}

// ExtractPNGCharacterCard extracts the common Tavern Card text payloads while
// leaving the PNG untouched. Optimization is performed separately below.
func ExtractPNGCharacterCard(data []byte) ([]byte, CharacterCard, error) {
	if err := ValidatePNG(data); err != nil {
		return nil, CharacterCard{}, err
	}
	chunks, err := parsePNGChunks(data)
	if err != nil {
		return nil, CharacterCard{}, err
	}
	for _, chunk := range chunks {
		chunkType := string(chunk.Type[:])
		if chunkType != "tEXt" && chunkType != "zTXt" && chunkType != "iTXt" {
			continue
		}
		key, payload, ok, err := decodePNGTextChunk(chunkType, chunk.Data)
		if err != nil {
			return nil, CharacterCard{}, err
		}
		if !ok || !isCharacterCardKey(key) {
			continue
		}
		normalized, card, err := decodeCharacterCardPayload(key, payload)
		if err == nil {
			return normalized, card, nil
		}
	}
	return nil, CharacterCard{}, errUnsupportedCharacterCard
}

func decodePNGTextChunk(chunkType string, chunk []byte) (string, []byte, bool, error) {
	keyword, rest, ok := bytes.Cut(chunk, []byte{0})
	if !ok {
		return "", nil, false, nil
	}
	key := string(keyword)
	switch chunkType {
	case "tEXt":
		return key, rest, true, nil
	case "zTXt":
		if len(rest) < 2 || rest[0] != 0 {
			return key, nil, true, errors.New("invalid compressed PNG text chunk")
		}
		payload, err := readZlibPayload(rest[1:])
		return key, payload, true, err
	case "iTXt":
		if len(rest) < 2 || (rest[0] != 0 && rest[0] != 1) {
			return key, nil, true, errors.New("invalid international PNG text chunk")
		}
		compressed, method := rest[0] == 1, rest[1]
		_, rest, ok = bytes.Cut(rest[2:], []byte{0})
		if !ok {
			return key, nil, true, errors.New("invalid PNG language tag")
		}
		_, rest, ok = bytes.Cut(rest, []byte{0})
		if !ok {
			return key, nil, true, errors.New("invalid translated PNG keyword")
		}
		if !compressed {
			return key, rest, true, nil
		}
		if method != 0 {
			return key, nil, true, errors.New("unsupported PNG text compression")
		}
		payload, err := readZlibPayload(rest)
		return key, payload, true, err
	default:
		return "", nil, false, nil
	}
}

func readZlibPayload(data []byte) ([]byte, error) {
	reader, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	payload, err := io.ReadAll(io.LimitReader(reader, maxPNGTextInflatedBytes+1))
	if err != nil {
		return nil, err
	}
	if len(payload) > maxPNGTextInflatedBytes {
		return nil, errors.New("PNG text payload exceeds limit")
	}
	return payload, nil
}

func decodeCharacterCardPayload(key string, payload []byte) ([]byte, CharacterCard, error) {
	if key == "chara" || key == "ccv3" {
		decoded := make([]byte, base64.StdEncoding.DecodedLen(len(payload)))
		n, err := base64.StdEncoding.Decode(decoded, bytes.TrimSpace(payload))
		if err != nil {
			return nil, CharacterCard{}, errUnsupportedCharacterCard
		}
		payload = decoded[:n]
	}
	return NormalizeCharacterCardJSON(payload)
}

func isCharacterCardKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	return key == "chara" || key == "chara_card_v2" || key == "character" || key == "ccv3"
}

func ContentHash(data []byte) string {
	hash := sha256.Sum256(data)
	return fmt.Sprintf("%x", hash[:])
}

func ValidatePNG(data []byte) error {
	if len(data) < len(pngSignature) || !bytes.Equal(data[:len(pngSignature)], pngSignature) {
		return errUnsupportedCharacterCard
	}
	if _, err := parsePNGChunks(data); err != nil {
		return err
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode PNG header: %w", err)
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > maxPNGDimension || config.Height > maxPNGDimension || int64(config.Width)*int64(config.Height) > maxPNGPixels {
		return errors.New("PNG dimensions exceed marketplace limits")
	}
	return nil
}

type losslessPNGOptimizer struct{}

func (losslessPNGOptimizer) OptimizePNG(data []byte) ([]byte, error) {
	chunks, err := parsePNGChunks(data)
	if err != nil {
		return nil, err
	}
	safeChunks, err := sanitizePNGChunks(chunks)
	if err != nil {
		return nil, err
	}
	chunks = safeChunks
	var compressed bytes.Buffer
	idatCount := 0
	for _, chunk := range chunks {
		if string(chunk.Type[:]) == "IDAT" {
			idatCount++
			compressed.Write(chunk.Data)
		}
	}
	if idatCount == 0 {
		return nil, errors.New("PNG has no image data")
	}
	reader, err := zlib.NewReader(bytes.NewReader(compressed.Bytes()))
	if err != nil {
		return nil, errors.New("invalid PNG image stream")
	}
	raw, err := io.ReadAll(io.LimitReader(reader, maxPNGInflatedBytes+1))
	closeErr := reader.Close()
	if err != nil || closeErr != nil || len(raw) > maxPNGInflatedBytes {
		return nil, errors.New("invalid or oversized PNG image stream")
	}
	var recompressed bytes.Buffer
	writer, err := zlib.NewWriterLevel(&recompressed, zlib.BestCompression)
	if err != nil {
		return nil, err
	}
	if _, err := writer.Write(raw); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	if recompressed.Len() >= compressed.Len() {
		return nil, errors.New("lossless PNG optimization did not reduce image stream")
	}

	result := bytes.NewBuffer(make([]byte, 0, len(data)))
	result.Write(pngSignature)
	inserted := false
	for _, chunk := range chunks {
		typ := string(chunk.Type[:])
		switch typ {
		case "IHDR", "IEND":
			result.Write(encodePNGChunk(chunk))
		case "tEXt", "zTXt", "iTXt":
			key, _, ok, textErr := decodePNGTextChunk(typ, chunk.Data)
			if textErr != nil {
				return nil, textErr
			}
			if ok && isCharacterCardKey(key) {
				result.Write(encodePNGChunk(chunk))
			}
		case "IDAT":
			if inserted {
				continue
			}
			inserted = true
			payload := recompressed.Bytes()
			const maxChunk = 1 << 20
			for len(payload) > 0 {
				size := len(payload)
				if size > maxChunk {
					size = maxChunk
				}
				result.Write(encodePNGChunk(pngChunk{Type: chunk.Type, Data: payload[:size]}))
				payload = payload[size:]
			}
		}
	}
	optimized := result.Bytes()
	if len(optimized) >= len(data) {
		return nil, errors.New("lossless PNG optimization did not reduce file size")
	}
	if !samePNGImages(data, optimized) {
		return nil, errors.New("lossless PNG optimization changed pixels")
	}
	return optimized, nil
}

func samePNGImages(first, second []byte) bool {
	left, err := png.Decode(bytes.NewReader(first))
	if err != nil {
		return false
	}
	right, err := png.Decode(bytes.NewReader(second))
	if err != nil || !left.Bounds().Eq(right.Bounds()) {
		return false
	}
	bounds := left.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if left.At(x, y) != right.At(x, y) {
				return false
			}
		}
	}
	return true
}

func init() {
	SetPNGOptimizer(losslessPNGOptimizer{})
}
