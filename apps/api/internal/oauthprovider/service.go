package oauthprovider

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrInvalidClient            = errors.New("invalid OAuth client")
	ErrInvalidRedirectURI       = errors.New("invalid redirect URI")
	ErrInvalidScope             = errors.New("invalid OAuth scope")
	ErrInvalidPKCE              = errors.New("invalid PKCE verifier")
	ErrInvalidAuthorizationCode = errors.New("invalid authorization code")
	ErrInvalidAccessToken       = errors.New("invalid access token")
)

var supportedScopes = map[string]bool{ScopeOpenID: true, ScopeProfile: true, ScopeEmail: true}

func randomURLValue(bytes int) (string, error) {
	data := make([]byte, bytes)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func hashSecret(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func compareSecret(hash, value string) bool {
	actual := hashSecret(value)
	return subtle.ConstantTimeCompare([]byte(hash), []byte(actual)) == 1
}

func parseStringList(raw string) ([]string, error) {
	var values []string
	if err := common.Unmarshal([]byte(raw), &values); err != nil {
		return nil, err
	}
	return values, nil
}

func marshalStringList(values []string) (string, error) {
	data, err := common.Marshal(values)
	return string(data), err
}

func normalizeScopes(raw string) (string, []string, error) {
	parts := strings.Fields(raw)
	if len(parts) == 0 {
		return "", nil, ErrInvalidScope
	}
	seen := make(map[string]bool, len(parts))
	out := make([]string, 0, len(parts))
	for _, scope := range parts {
		if !supportedScopes[scope] {
			return "", nil, ErrInvalidScope
		}
		if seen[scope] {
			continue
		}
		seen[scope] = true
		out = append(out, scope)
	}
	if len(out) == 0 {
		return "", nil, ErrInvalidScope
	}
	return strings.Join(out, " "), out, nil
}

func validateRedirectURI(raw string, allowLocalhost bool) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return ErrInvalidRedirectURI
	}
	if parsed.Scheme != "https" {
		if !allowLocalhost || parsed.Scheme != "http" || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "::1") {
			return ErrInvalidRedirectURI
		}
	}
	return nil
}

func redirectAllowed(client *OAuthClient, redirectURI string) bool {
	uris, err := parseStringList(client.RedirectURIsJSON)
	if err != nil {
		return false
	}
	for _, allowed := range uris {
		if subtle.ConstantTimeCompare([]byte(allowed), []byte(redirectURI)) == 1 {
			return true
		}
	}
	return false
}

func clientScopes(client *OAuthClient) []string {
	values, err := parseStringList(client.ScopesJSON)
	if err != nil {
		return nil
	}
	return values
}

func scopesAllowed(client *OAuthClient, requested []string) bool {
	allowed := make(map[string]bool)
	for _, scope := range clientScopes(client) {
		allowed[scope] = true
	}
	for _, scope := range requested {
		if !allowed[scope] {
			return false
		}
	}
	return true
}

func ValidateClient(tx *gorm.DB, clientID, clientSecret, redirectURI string) (*OAuthClient, error) {
	var client OAuthClient
	if err := tx.Where("client_id = ? AND enabled = ?", clientID, true).First(&client).Error; err != nil {
		return nil, ErrInvalidClient
	}
	if !redirectAllowed(&client, redirectURI) {
		return nil, ErrInvalidRedirectURI
	}
	if client.ClientType == ClientTypeConfidential && !compareSecret(client.ClientSecretHash, clientSecret) {
		return nil, ErrInvalidClient
	}
	return &client, nil
}

func CreateClient(tx *gorm.DB, createdBy int, name, clientType string, redirects, scopes []string) (*OAuthClient, string, error) {
	if createdBy <= 0 || strings.TrimSpace(name) == "" || (clientType != ClientTypeConfidential && clientType != ClientTypePublic) || len(redirects) == 0 {
		return nil, "", ErrInvalidClient
	}
	for _, redirect := range redirects {
		if err := validateRedirectURI(redirect, true); err != nil {
			return nil, "", err
		}
	}
	normalizedScope, _, err := normalizeScopes(strings.Join(scopes, " "))
	if err != nil {
		return nil, "", err
	}
	_, scopeValues, _ := normalizeScopes(normalizedScope)
	redirectJSON, err := marshalStringList(redirects)
	if err != nil {
		return nil, "", err
	}
	scopeJSON, err := marshalStringList(scopeValues)
	if err != nil {
		return nil, "", err
	}
	clientID, err := randomURLValue(24)
	if err != nil {
		return nil, "", err
	}
	secret := ""
	secretHash := ""
	if clientType == ClientTypeConfidential {
		secret, err = randomURLValue(36)
		if err != nil {
			return nil, "", err
		}
		secretHash = hashSecret(secret)
	}
	client := &OAuthClient{ClientID: clientID, Name: strings.TrimSpace(name), ClientType: clientType, ClientSecretHash: secretHash, RedirectURIsJSON: redirectJSON, ScopesJSON: scopeJSON, Enabled: true, CreatedBy: createdBy, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := tx.Create(client).Error; err != nil {
		return nil, "", err
	}
	return client, secret, nil
}

func VerifyPKCE(verifier, challenge, method string) error {
	if method != "S256" || len(verifier) < 43 || len(verifier) > 128 || strings.TrimSpace(challenge) == "" {
		return ErrInvalidPKCE
	}
	sum := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) != 1 {
		return ErrInvalidPKCE
	}
	return nil
}

func CreateAuthorizationCode(tx *gorm.DB, clientID string, userID int, redirectURI, scope, challenge, method, nonce string) (string, error) {
	if userID <= 0 || method != "S256" || strings.TrimSpace(challenge) == "" {
		return "", ErrInvalidPKCE
	}
	normalized, _, err := normalizeScopes(scope)
	if err != nil {
		return "", err
	}
	code, err := randomURLValue(32)
	if err != nil {
		return "", err
	}
	record := &OAuthAuthorizationCode{CodeHash: hashSecret(code), ClientID: clientID, UserID: userID, RedirectURI: redirectURI, Scope: normalized, CodeChallenge: challenge, CodeChallengeMethod: method, Nonce: nonce, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(2 * time.Minute), Status: AuthorizationCodeStatusActive}
	if err := tx.Create(record).Error; err != nil {
		return "", err
	}
	return code, nil
}

func ConsumeAuthorizationCode(tx *gorm.DB, rawCode, clientID, redirectURI, verifier string) (*OAuthAuthorizationCode, error) {
	var record OAuthAuthorizationCode
	query := dbx.LockForUpdate(tx).Where("code_hash = ? AND client_id = ?", hashSecret(rawCode), clientID)
	if err := query.First(&record).Error; err != nil {
		return nil, ErrInvalidAuthorizationCode
	}
	if record.Status != AuthorizationCodeStatusActive || record.UsedAt != nil || time.Now().After(record.ExpiresAt) || record.RedirectURI != redirectURI {
		return nil, ErrInvalidAuthorizationCode
	}
	if err := VerifyPKCE(verifier, record.CodeChallenge, record.CodeChallengeMethod); err != nil {
		return nil, err
	}
	now := time.Now()
	if err := tx.Model(&record).Updates(map[string]any{"status": AuthorizationCodeStatusUsed, "used_at": now}).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func CreateAccessToken(tx *gorm.DB, clientID string, userID int, scope string) (string, *OAuthAccessToken, error) {
	raw, err := randomURLValue(32)
	if err != nil {
		return "", nil, err
	}
	normalized, _, err := normalizeScopes(scope)
	if err != nil {
		return "", nil, err
	}
	token := &OAuthAccessToken{TokenHash: hashSecret(raw), ClientID: clientID, UserID: userID, Scope: normalized, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(15 * time.Minute), Status: AccessTokenStatusActive}
	if err := tx.Create(token).Error; err != nil {
		return "", nil, err
	}
	return raw, token, nil
}

func LoadAccessToken(tx *gorm.DB, raw string) (*OAuthAccessToken, error) {
	var token OAuthAccessToken
	if err := tx.Where("token_hash = ? AND status = ?", hashSecret(raw), AccessTokenStatusActive).First(&token).Error; err != nil || token.RevokedAt != nil || time.Now().After(token.ExpiresAt) {
		return nil, ErrInvalidAccessToken
	}
	return &token, nil
}

func RevokeAccessToken(tx *gorm.DB, raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	now := time.Now()
	return tx.Model(&OAuthAccessToken{}).Where("token_hash = ? AND status = ?", hashSecret(raw), AccessTokenStatusActive).Updates(map[string]any{"status": AccessTokenStatusRevoked, "revoked_at": now}).Error
}

func SubjectForUser(issuer string, clientID string, userID int) string {
	return hashSecret(fmt.Sprintf("%s|%s|%d", issuer, clientID, userID))
}

func ParseScopes(raw string) []string {
	_, values, err := normalizeScopes(raw)
	if err != nil {
		return nil
	}
	return values
}

func IsScopeAllowed(scope string, wanted string) bool {
	for _, value := range strings.Fields(scope) {
		if value == wanted {
			return true
		}
	}
	return false
}

func MarshalClaims(value any) (string, error) {
	data, err := json.Marshal(value)
	return string(data), err
}

func NewID() string { return uuid.NewString() }
