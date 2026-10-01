package oauthprovider

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"math/big"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/identity"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

const signingKeyPurpose = "oauth-provider-signing-key-v1"

func activeSigningKey(tx *gorm.DB) (*OAuthSigningKey, *rsa.PrivateKey, error) {
	var record OAuthSigningKey
	if err := tx.Where("status = ?", SigningKeyStatusActive).Order("id desc").First(&record).Error; err != nil {
		return nil, nil, err
	}
	privatePEM, err := common.DecryptAESGCM(record.PrivateKeyData, signingKeyPurpose)
	if err != nil {
		return nil, nil, err
	}
	block, _ := pem.Decode([]byte(privatePEM))
	if block == nil {
		return nil, nil, errors.New("invalid OAuth signing key PEM")
	}
	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, nil, err
	}
	return &record, privateKey, nil
}

func ensureSigningKey(tx *gorm.DB) (*OAuthSigningKey, *rsa.PrivateKey, error) {
	key, privateKey, err := activeSigningKey(tx)
	if err == nil {
		return key, privateKey, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}
	privateKey, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}
	der := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(privateKey)})
	encrypted, err := common.EncryptAESGCM(string(der), signingKeyPurpose)
	if err != nil {
		return nil, nil, err
	}
	kid, err := randomURLValue(18)
	if err != nil {
		return nil, nil, err
	}
	record := &OAuthSigningKey{KeyID: kid, PrivateKeyData: encrypted, PublicKeyN: base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()), PublicKeyE: privateKey.PublicKey.E, Algorithm: "RS256", Status: SigningKeyStatusActive, CreatedAt: time.Now()}
	if err := tx.Create(record).Error; err != nil {
		return nil, nil, err
	}
	return record, privateKey, nil
}

func RotateSigningKey(tx *gorm.DB) (*OAuthSigningKey, error) {
	if err := tx.Model(&OAuthSigningKey{}).Where("status = ?", SigningKeyStatusActive).Update("status", SigningKeyStatusRetired).Error; err != nil {
		return nil, err
	}
	_, privateKey, err := ensureSigningKey(tx)
	if err != nil {
		return nil, err
	}
	var record OAuthSigningKey
	if err := tx.Where("status = ?", SigningKeyStatusActive).Order("id desc").First(&record).Error; err != nil {
		return nil, err
	}
	_ = privateKey
	return &record, nil
}

func JWKS(tx *gorm.DB) ([]map[string]any, error) {
	var keys []OAuthSigningKey
	if err := tx.Where("status = ?", SigningKeyStatusActive).Or("status = ? AND (expires_at IS NULL OR expires_at > ?)", SigningKeyStatusRetired, time.Now()).Find(&keys).Error; err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		result = append(result, map[string]any{"kty": "RSA", "use": "sig", "alg": key.Algorithm, "kid": key.KeyID, "n": key.PublicKeyN, "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKeyE)).Bytes())})
	}
	return result, nil
}

func IssueIDToken(tx *gorm.DB, issuer string, client *OAuthClient, user *identity.User, scope, nonce string) (string, int64, error) {
	keyRecord, privateKey, err := ensureSigningKey(tx)
	if err != nil {
		return "", 0, err
	}
	now := time.Now()
	expires := now.Add(5 * time.Minute)
	claims := jwt.MapClaims{"iss": issuer, "sub": SubjectForUser(issuer, client.ClientID, user.Id), "aud": client.ClientID, "iat": now.Unix(), "exp": expires.Unix(), "auth_time": now.Unix()}
	if nonce != "" {
		claims["nonce"] = nonce
	}
	if IsScopeAllowed(scope, ScopeProfile) {
		claims["preferred_username"] = user.Username
		claims["name"] = user.DisplayName
	}
	if IsScopeAllowed(scope, ScopeEmail) && user.Email != "" {
		claims["email"] = user.Email
		claims["email_verified"] = false
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = keyRecord.KeyID
	signed, err := token.SignedString(privateKey)
	return signed, expires.Unix(), err
}
