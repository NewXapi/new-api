package oauthprovider

import (
	"time"

	"github.com/QuantumNous/new-api/internal/common/dbx"
)

const (
	ClientTypeConfidential = "confidential"
	ClientTypePublic       = "public"

	AuthorizationCodeStatusActive  = "active"
	AuthorizationCodeStatusUsed    = "used"
	AuthorizationCodeStatusRevoked = "revoked"

	AccessTokenStatusActive  = "active"
	AccessTokenStatusRevoked = "revoked"

	ScopeOpenID  = "openid"
	ScopeProfile = "profile"
	ScopeEmail   = "email"

	SigningKeyStatusActive  = "active"
	SigningKeyStatusRetired = "retired"
)

type OAuthClient struct {
	ID               int64      `gorm:"primaryKey" json:"id"`
	ClientID         string     `gorm:"size:96;not null;uniqueIndex" json:"client_id"`
	Name             string     `gorm:"size:200;not null" json:"name"`
	ClientType       string     `gorm:"size:20;not null" json:"client_type"`
	ClientSecretHash string     `gorm:"size:128" json:"-"`
	RedirectURIsJSON string     `gorm:"type:text;not null" json:"redirect_uris,omitempty"`
	ScopesJSON       string     `gorm:"type:text;not null" json:"scopes,omitempty"`
	Enabled          bool       `gorm:"not null;index" json:"enabled"`
	CreatedBy        int        `gorm:"not null;index" json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	DisabledAt       *time.Time `json:"disabled_at,omitempty"`
}

type OAuthAuthorizationCode struct {
	ID                  int64      `gorm:"primaryKey" json:"id"`
	CodeHash            string     `gorm:"size:128;not null;uniqueIndex" json:"-"`
	ClientID            string     `gorm:"size:96;not null;index" json:"client_id"`
	UserID              int        `gorm:"not null;index" json:"user_id"`
	RedirectURI         string     `gorm:"size:2048;not null" json:"-"`
	Scope               string     `gorm:"size:512;not null" json:"scope"`
	CodeChallenge       string     `gorm:"size:128;not null" json:"-"`
	CodeChallengeMethod string     `gorm:"size:16;not null" json:"-"`
	Nonce               string     `gorm:"size:256" json:"-"`
	CreatedAt           time.Time  `json:"created_at"`
	ExpiresAt           time.Time  `gorm:"not null;index" json:"expires_at"`
	UsedAt              *time.Time `json:"used_at,omitempty"`
	Status              string     `gorm:"size:16;not null;index" json:"status"`
}

type OAuthConsentRequest struct {
	ID                  string    `gorm:"primaryKey;size:96" json:"id"`
	ClientID            string    `gorm:"size:96;not null;index" json:"client_id"`
	RedirectURI         string    `gorm:"size:2048;not null" json:"redirect_uri"`
	Scope               string    `gorm:"size:512;not null" json:"scope"`
	State               string    `gorm:"size:1024" json:"state,omitempty"`
	CodeChallenge       string    `gorm:"size:128;not null" json:"-"`
	CodeChallengeMethod string    `gorm:"size:16;not null" json:"-"`
	Nonce               string    `gorm:"size:256" json:"-"`
	CreatedAt           time.Time `json:"created_at"`
	ExpiresAt           time.Time `gorm:"not null;index" json:"expires_at"`
	UserID              int       `gorm:"index" json:"user_id"`
}

type OAuthAccessToken struct {
	ID        int64      `gorm:"primaryKey" json:"id"`
	TokenHash string     `gorm:"size:128;not null;uniqueIndex" json:"-"`
	ClientID  string     `gorm:"size:96;not null;index" json:"client_id"`
	UserID    int        `gorm:"not null;index" json:"user_id"`
	Scope     string     `gorm:"size:512;not null" json:"scope"`
	CreatedAt time.Time  `json:"created_at"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
	Status    string     `gorm:"size:16;not null;index" json:"status"`
}

type OAuthSigningKey struct {
	ID             int64      `gorm:"primaryKey" json:"id"`
	KeyID          string     `gorm:"size:96;not null;uniqueIndex" json:"kid"`
	PrivateKeyData string     `gorm:"type:text;not null" json:"-"`
	PublicKeyN     string     `gorm:"type:text;not null" json:"n"`
	PublicKeyE     int        `gorm:"not null" json:"e"`
	Algorithm      string     `gorm:"size:16;not null" json:"alg"`
	Status         string     `gorm:"size:16;not null;index" json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
}

func init() {
	dbx.RegisterMigrations(
		dbx.Migration{Model: &OAuthClient{}, Name: "OAuthProviderClient"},
		dbx.Migration{Model: &OAuthAuthorizationCode{}, Name: "OAuthProviderAuthorizationCode"},
		dbx.Migration{Model: &OAuthConsentRequest{}, Name: "OAuthProviderConsentRequest"},
		dbx.Migration{Model: &OAuthAccessToken{}, Name: "OAuthProviderAccessToken"},
		dbx.Migration{Model: &OAuthSigningKey{}, Name: "OAuthProviderSigningKey"},
	)
}
