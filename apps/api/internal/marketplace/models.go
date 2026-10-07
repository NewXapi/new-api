package marketplace

import (
	"database/sql/driver"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"gorm.io/gorm"
)

type ResourceTags []string

func (tags ResourceTags) Value() (driver.Value, error) {
	if tags == nil {
		return "[]", nil
	}
	// Must return string, not []byte: []byte binds as a BLOB and SQLite's
	// LIKE never matches BLOB values, which would silently break tag filters.
	data, err := common.Marshal(tags)
	if err != nil {
		return nil, err
	}
	return string(data), nil
}

func (tags *ResourceTags) Scan(value any) error {
	if value == nil {
		*tags = nil
		return nil
	}
	var data []byte
	switch v := value.(type) {
	case []byte:
		data = append([]byte(nil), v...)
	case string:
		data = []byte(v)
	default:
		encoded, err := common.Marshal(v)
		if err != nil {
			return err
		}
		data = encoded
	}
	return common.Unmarshal(data, tags)
}

const (
	ResourceTypeCharacterCard = "character_card"
	ResourceTypeTutorial      = "tutorial"

	VisibilityPrivate = "private"
	VisibilityShared  = "shared"
	VisibilityPublic  = "public"

	CurrencyQuota = "quota"
	CurrencySpore = "spore"

	ResourceStatusDraft     = "draft"
	ResourceStatusPublished = "published"
	ResourceStatusUnlisted  = "unlisted"
	ResourceStatusDeleted   = "deleted"

	VersionStatusDraft     = "draft"
	VersionStatusReviewing = "reviewing"
	VersionStatusApproved  = "approved"
	VersionStatusRejected  = "rejected"

	SourceAuthor   = "author"
	SourceClaim    = "claim"
	SourcePurchase = "purchase"
	SourceShare    = "share"

	OrderStatusSuccess = "success"
	OrderStatusFailed  = "failed"
)

// MarketplaceSetting stores singleton marketplace controls. Ratios use basis
// points (10000 means 100%); income freeze is configured in minutes.
type MarketplaceSetting struct {
	ID                  int64 `gorm:"primaryKey" json:"id"`
	MaxUploadBytes      int64 `gorm:"not null" json:"max_upload_bytes"`
	BaseShareRatio      int64 `gorm:"not null" json:"base_share_ratio"`
	IncomeFreezeMinutes int64 `gorm:"not null;default:60" json:"income_freeze_minutes"`
}

// Resource is the stable identity and access policy of a marketplace item.
type Resource struct {
	ID               int64          `gorm:"primaryKey" json:"id"`
	AuthorID         int            `gorm:"not null;index" json:"author_id"`
	Type             string         `gorm:"size:32;not null;index" json:"type"`
	Title            string         `gorm:"size:200;not null" json:"title"`
	Summary          string         `gorm:"type:text" json:"summary"`
	Tags             ResourceTags   `gorm:"type:text" json:"tags"`
	Visibility       string         `gorm:"size:16;not null;index" json:"visibility"`
	Status           string         `gorm:"size:16;not null;index" json:"status"`
	Price            int64          `gorm:"not null;default:0" json:"price"`
	Currency         string         `gorm:"size:16;not null;default:quota" json:"currency"`
	CurrentVersionID int64          `gorm:"index" json:"current_version_id"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}

// ResourceVersion stores immutable content submissions. The approved version
// remains visible while a newer version is being reviewed.
type ResourceVersion struct {
	ID             int64     `gorm:"primaryKey" json:"id"`
	ResourceID     int64     `gorm:"not null;index" json:"resource_id"`
	Version        int       `gorm:"not null" json:"version"`
	Format         string    `gorm:"size:32;not null" json:"format"`
	Content        string    `gorm:"type:text" json:"content,omitempty"`
	NormalizedJSON string    `gorm:"type:text" json:"normalized_json,omitempty"`
	PNGData        []byte    `json:"-"`
	ContentHash    string    `gorm:"size:128;not null" json:"content_hash"`
	Status         string    `gorm:"size:16;not null;index" json:"status"`
	ReviewReason   string    `gorm:"type:text" json:"review_reason,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ResourceShare grants direct, free access to a selected user.
type ResourceShare struct {
	ID         int64      `gorm:"primaryKey" json:"id"`
	ResourceID int64      `gorm:"not null;uniqueIndex:ux_resource_share_user" json:"resource_id"`
	UserID     int        `gorm:"not null;uniqueIndex:ux_resource_share_user" json:"user_id"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ResourceGrant is the unified access record for authors, claims, purchases,
// and direct shares.
type ResourceGrant struct {
	ID         int64      `gorm:"primaryKey" json:"id"`
	ResourceID int64      `gorm:"not null;index" json:"resource_id"`
	UserID     int        `gorm:"not null;index" json:"user_id"`
	Source     string     `gorm:"size:16;not null;index" json:"source"`
	OrderID    *int64     `gorm:"index" json:"order_id,omitempty"`
	GrantedAt  time.Time  `json:"granted_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
}

// ResourceReview records moderation decisions for a submitted version.
type ResourceReview struct {
	ID         int64     `gorm:"primaryKey" json:"id"`
	VersionID  int64     `gorm:"not null;index" json:"version_id"`
	ReviewerID int       `gorm:"not null;index" json:"reviewer_id"`
	Decision   string    `gorm:"size:16;not null" json:"decision"`
	Reason     string    `gorm:"type:text" json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

// ResourceOrder is separate from AI usage logs and records one idempotent
// marketplace purchase.
type ResourceOrder struct {
	ID               int64      `gorm:"primaryKey" json:"id"`
	IdempotencyKey   string     `gorm:"size:128;not null;uniqueIndex" json:"idempotency_key"`
	ResourceID       int64      `gorm:"not null;uniqueIndex:ux_marketplace_buyer_resource" json:"resource_id"`
	VersionID        int64      `gorm:"not null;index" json:"version_id"`
	BuyerID          int        `gorm:"not null;uniqueIndex:ux_marketplace_buyer_resource;index" json:"buyer_id"`
	AuthorID         int        `gorm:"not null;index" json:"author_id"`
	Amount           int64      `gorm:"not null" json:"amount"`
	Currency         string     `gorm:"size:16;not null" json:"currency"`
	Status           string     `gorm:"size:16;not null;index" json:"status"`
	AgreementID      *int64     `gorm:"index" json:"agreement_id,omitempty"`
	AgreementVersion string     `gorm:"size:64" json:"agreement_version,omitempty"`
	ShareRatio       int64      `gorm:"not null;default:0" json:"share_ratio"`
	CreatedAt        time.Time  `json:"created_at"`
	CompletedAt      *time.Time `json:"completed_at,omitempty"`
}

// ResourceSettlement snapshots the split produced by an order. Author income
// stays frozen until ThawAt and only reaches the balance via manual exchange.
type ResourceSettlement struct {
	ID             int64      `gorm:"primaryKey" json:"id"`
	OrderID        int64      `gorm:"not null;uniqueIndex" json:"order_id"`
	AuthorID       int        `gorm:"not null;index" json:"author_id"`
	AuthorAmount   int64      `gorm:"not null" json:"author_amount"`
	PlatformAmount int64      `gorm:"not null" json:"platform_amount"`
	Currency       string     `gorm:"size:16;not null" json:"currency"`
	CreatedAt      time.Time  `json:"created_at"`
	ThawAt         time.Time  `gorm:"not null;index" json:"thaw_at"`
	ExchangedAt    *time.Time `json:"exchanged_at,omitempty"`
}

// RevenueAgreement is a versioned author agreement that determines a split
// tier. Acceptance is recorded separately so historical orders can be audited.
type RevenueAgreement struct {
	ID          int64      `gorm:"primaryKey" json:"id"`
	Name        string     `gorm:"size:200;not null" json:"name"`
	Version     string     `gorm:"size:64;not null;uniqueIndex" json:"version"`
	Body        string     `gorm:"type:text;not null" json:"body"`
	ShareRatio  int64      `gorm:"not null" json:"share_ratio"`
	Enabled     bool       `gorm:"not null;index" json:"enabled"`
	CreatedAt   time.Time  `json:"created_at"`
	EffectiveAt *time.Time `json:"effective_at,omitempty"`
	ExpiredAt   *time.Time `json:"expired_at,omitempty"`
}

type RevenueAgreementAcceptance struct {
	ID          int64     `gorm:"primaryKey" json:"id"`
	AgreementID int64     `gorm:"not null;uniqueIndex:ux_agreement_user" json:"agreement_id"`
	UserID      int       `gorm:"not null;uniqueIndex:ux_agreement_user" json:"user_id"`
	Version     string    `gorm:"size:64;not null" json:"version"`
	AcceptedAt  time.Time `json:"accepted_at"`
}

func init() {
	dbx.RegisterMigrations(
		dbx.Migration{Model: &MarketplaceSetting{}, Name: "MarketplaceSetting"},
		dbx.Migration{Model: &Resource{}, Name: "MarketplaceResource"},
		dbx.Migration{Model: &ResourceVersion{}, Name: "MarketplaceResourceVersion"},
		dbx.Migration{Model: &ResourceShare{}, Name: "MarketplaceResourceShare"},
		dbx.Migration{Model: &ResourceGrant{}, Name: "MarketplaceResourceGrant"},
		dbx.Migration{Model: &ResourceReview{}, Name: "MarketplaceResourceReview"},
		dbx.Migration{Model: &ResourceOrder{}, Name: "MarketplaceResourceOrder"},
		dbx.Migration{Model: &ResourceSettlement{}, Name: "MarketplaceResourceSettlement"},
		dbx.Migration{Model: &RevenueAgreement{}, Name: "MarketplaceRevenueAgreement"},
		dbx.Migration{Model: &RevenueAgreementAcceptance{}, Name: "MarketplaceRevenueAgreementAcceptance"},
	)
}
