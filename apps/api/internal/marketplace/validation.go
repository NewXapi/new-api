package marketplace

import (
	"bytes"
	"errors"
	"fmt"
	"sync"
)

var (
	configMu       sync.RWMutex
	maxUploadBytes int64 = 16 << 20
	pngOptimizer   PNGOptimizer
)

// PNGOptimizer must preserve pixels, all PNG metadata, and the embedded Tavern
// payload. Implementations must return an error when they cannot prove those
// invariants. The package does not silently substitute a lossy image encoder.
type PNGOptimizer interface {
	OptimizePNG(data []byte) ([]byte, error)
}

func SetMaxUploadBytes(limit int64) error {
	if limit <= 0 {
		return errors.New("marketplace upload limit must be positive")
	}
	configMu.Lock()
	maxUploadBytes = limit
	configMu.Unlock()
	return nil
}

func MaxUploadBytes() int64 {
	configMu.RLock()
	defer configMu.RUnlock()
	return maxUploadBytes
}

func SetPNGOptimizer(optimizer PNGOptimizer) {
	configMu.Lock()
	pngOptimizer = optimizer
	configMu.Unlock()
}

func ValidateUpload(resourceType, format string, data []byte) ([]byte, CharacterCard, error) {
	if int64(len(data)) > MaxUploadBytes() {
		return nil, CharacterCard{}, fmt.Errorf("upload exceeds marketplace limit of %d bytes", MaxUploadBytes())
	}
	switch resourceType {
	case ResourceTypeTutorial:
		if format != FormatTutorialMarkdown {
			return nil, CharacterCard{}, errors.New("tutorial must use markdown format")
		}
		if err := ValidateTutorialMarkdown(string(data)); err != nil {
			return nil, CharacterCard{}, err
		}
		return append([]byte(nil), data...), CharacterCard{}, nil
	case ResourceTypeCharacterCard:
		switch format {
		case FormatCharacterCardJSON:
			return NormalizeCharacterCardJSON(data)
		case FormatCharacterCardPNG:
			return validateAndOptimizePNG(data)
		default:
			return nil, CharacterCard{}, errors.New("unsupported character card format")
		}
	default:
		return nil, CharacterCard{}, errors.New("unsupported marketplace resource type")
	}
}

func validateAndOptimizePNG(data []byte) ([]byte, CharacterCard, error) {
	normalized, card, err := ExtractPNGCharacterCard(data)
	if err != nil {
		return nil, CharacterCard{}, err
	}
	configMu.RLock()
	optimizer := pngOptimizer
	configMu.RUnlock()
	if optimizer == nil {
		return nil, CharacterCard{}, errors.New("lossless PNG optimizer is not configured")
	}
	optimized, err := optimizer.OptimizePNG(data)
	if err != nil {
		return nil, CharacterCard{}, fmt.Errorf("optimize character card PNG: %w", err)
	}
	if len(optimized) >= len(data) {
		return nil, CharacterCard{}, errors.New("lossless PNG optimization did not reduce file size")
	}
	if _, _, err := ExtractPNGCharacterCard(optimized); err != nil {
		return nil, CharacterCard{}, errors.New("optimized PNG no longer contains a valid character card")
	}
	if !bytes.Equal(normalized, normalizedPNGPayload(optimized)) {
		return nil, CharacterCard{}, errors.New("optimized PNG changed character card data")
	}
	return optimized, card, nil
}

// normalizedPNGPayload re-reads the embedded card. It returns nil for invalid
// data; callers already validate the optimized PNG before comparing content.
func normalizedPNGPayload(data []byte) []byte {
	normalized, _, err := ExtractPNGCharacterCard(data)
	if err != nil {
		return nil
	}
	return normalized
}
