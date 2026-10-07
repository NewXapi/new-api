package marketplace

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/common/quotacache"
	"github.com/QuantumNous/new-api/internal/identity"
	"gorm.io/gorm"
)

var (
	ErrResourceNotFound    = errors.New("marketplace resource not found")
	ErrResourceForbidden   = errors.New("marketplace resource access denied")
	ErrInvalidResource     = errors.New("invalid marketplace resource")
	ErrReviewRequired      = errors.New("resource content requires review")
	ErrAlreadyOwned        = errors.New("marketplace resource already owned")
	ErrInsufficientBalance = errors.New("marketplace balance is insufficient")
)

const (
	DefaultMarketplaceMaxUploadBytes      int64 = 16 << 20
	DefaultMarketplaceShareRatio          int64 = 0
	DefaultMarketplaceIncomeFreezeMinutes int64 = 60
	ShareRatioScale                       int64 = 10000

	MaxResourceTags     = 8
	MaxResourceTagRunes = 24
)

// normalizeResourceTags trims, dedupes, and bounds author-supplied tags so a
// free-form tag input cannot push arbitrary payloads into the listing.
func normalizeResourceTags(tags []string) (ResourceTags, error) {
	if len(tags) == 0 {
		return nil, nil
	}
	seen := make(map[string]struct{}, len(tags))
	result := make(ResourceTags, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		if len([]rune(trimmed)) > MaxResourceTagRunes {
			return nil, ErrInvalidResource
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
		if len(result) > MaxResourceTags {
			return nil, ErrInvalidResource
		}
	}
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

func CreateResource(tx *gorm.DB, authorID int, resourceType, title, summary, visibility, currency string, price int64, tags []string) (*Resource, error) {
	if authorID <= 0 || strings.TrimSpace(title) == "" || price < 0 {
		return nil, ErrInvalidResource
	}
	if len(title) > 200 || len(summary) > 4000 {
		return nil, ErrInvalidResource
	}
	if resourceType != ResourceTypeCharacterCard && resourceType != ResourceTypeTutorial {
		return nil, ErrInvalidResource
	}
	if visibility != VisibilityPrivate && visibility != VisibilityShared && visibility != VisibilityPublic {
		return nil, ErrInvalidResource
	}
	if currency == "" {
		currency = CurrencyQuota
	}
	if currency != CurrencyQuota && currency != CurrencySpore {
		return nil, ErrInvalidResource
	}
	normalizedTags, err := normalizeResourceTags(tags)
	if err != nil {
		return nil, err
	}
	resource := &Resource{AuthorID: authorID, Type: resourceType, Title: strings.TrimSpace(title), Summary: summary, Tags: normalizedTags, Visibility: visibility, Status: ResourceStatusDraft, Price: price, Currency: currency}
	if err := tx.Create(resource).Error; err != nil {
		return nil, err
	}
	if err := tx.Create(&ResourceGrant{ResourceID: resource.ID, UserID: authorID, Source: SourceAuthor, GrantedAt: time.Now()}).Error; err != nil {
		return nil, err
	}
	return resource, nil
}

func AddResourceVersion(tx *gorm.DB, resourceID, authorID int64, format string, data []byte) (*ResourceVersion, error) {
	var resource Resource
	if err := tx.Where("id = ?", resourceID).First(&resource).Error; err != nil {
		return nil, err
	}
	if int64(resource.AuthorID) != authorID {
		return nil, ErrResourceForbidden
	}
	if _, err := EnsureMarketplaceSetting(tx); err != nil {
		return nil, err
	}
	stored, card, err := ValidateUpload(resource.Type, format, data)
	if err != nil {
		return nil, err
	}
	var versionNumber int
	if err := tx.Model(&ResourceVersion{}).Where("resource_id = ?", resourceID).Select("COALESCE(MAX(version), 0)").Scan(&versionNumber).Error; err != nil {
		return nil, err
	}
	version := &ResourceVersion{ResourceID: resourceID, Version: versionNumber + 1, Format: format, ContentHash: ContentHash(stored), Status: VersionStatusReviewing}
	if resource.Type == ResourceTypeTutorial {
		version.Content = string(stored)
	} else {
		version.NormalizedJSON = string(cardJSON(card))
		if format == FormatCharacterCardPNG {
			version.PNGData = stored
		} else {
			version.Content = string(stored)
		}
	}
	if resource.Visibility != VisibilityPublic {
		version.Status = VersionStatusApproved
	}
	if err := tx.Create(version).Error; err != nil {
		return nil, err
	}
	if resource.Visibility != VisibilityPublic {
		if err := tx.Model(&resource).Updates(map[string]any{"status": ResourceStatusPublished, "current_version_id": version.ID}).Error; err != nil {
			return nil, err
		}
	}
	return version, nil
}

func cardJSON(card CharacterCard) []byte {
	data, _ := common.Marshal(card.Raw)
	return data
}

func MobileCharacterFields(card CharacterCard) map[string]string {
	result := make(map[string]string)
	keys := []string{"name", "first_mes", "description", "personality", "scenario", "mes_example", "system_prompt", "creator_notes"}
	for _, key := range keys {
		if value, ok := characterField(card.Raw, key); ok {
			result[key] = value
		}
	}
	if data, ok := card.Raw["data"].(map[string]any); ok {
		for _, key := range keys {
			if _, exists := result[key]; exists {
				continue
			}
			if value, ok := characterField(data, key); ok {
				result[key] = value
			}
		}
	}
	return result
}

func characterField(raw map[string]any, key string) (string, bool) {
	value, ok := raw[key]
	if !ok {
		return "", false
	}
	text, ok := value.(string)
	return text, ok && strings.TrimSpace(text) != ""
}

func EnsureMarketplaceSetting(tx *gorm.DB) (*MarketplaceSetting, error) {
	var setting MarketplaceSetting
	if err := tx.First(&setting).Error; err == nil {
		if setting.MaxUploadBytes > 0 {
			_ = SetMaxUploadBytes(setting.MaxUploadBytes)
		}
		return &setting, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	setting = MarketplaceSetting{MaxUploadBytes: DefaultMarketplaceMaxUploadBytes, BaseShareRatio: DefaultMarketplaceShareRatio, IncomeFreezeMinutes: DefaultMarketplaceIncomeFreezeMinutes}
	if err := tx.Create(&setting).Error; err != nil {
		return nil, err
	}
	_ = SetMaxUploadBytes(setting.MaxUploadBytes)
	return &setting, nil
}

func ApproveResourceVersion(tx *gorm.DB, reviewerID int, versionID int64) error {
	var version ResourceVersion
	if err := tx.First(&version, versionID).Error; err != nil {
		return err
	}
	if version.Status != VersionStatusReviewing {
		return ErrReviewRequired
	}
	var resource Resource
	if err := tx.First(&resource, version.ResourceID).Error; err != nil {
		return err
	}
	now := time.Now()
	if err := tx.Model(&version).Updates(map[string]any{"status": VersionStatusApproved, "review_reason": ""}).Error; err != nil {
		return err
	}
	var latestApproved ResourceVersion
	latestErr := tx.Where("resource_id = ? AND status = ?", resource.ID, VersionStatusApproved).Order("version desc").First(&latestApproved).Error
	if errors.Is(latestErr, gorm.ErrRecordNotFound) || latestErr == nil && latestApproved.Version <= version.Version {
		if err := tx.Model(&resource).Updates(map[string]any{"status": ResourceStatusPublished, "current_version_id": version.ID}).Error; err != nil {
			return err
		}
	} else if latestErr != nil {
		return latestErr
	}
	return tx.Create(&ResourceReview{VersionID: version.ID, ReviewerID: reviewerID, Decision: VersionStatusApproved, CreatedAt: now}).Error
}

func RejectResourceVersion(tx *gorm.DB, reviewerID int, versionID int64, reason string) error {
	if strings.TrimSpace(reason) == "" {
		return errors.New("review rejection requires a reason")
	}
	var version ResourceVersion
	if err := tx.First(&version, versionID).Error; err != nil {
		return err
	}
	if version.Status != VersionStatusReviewing {
		return ErrReviewRequired
	}
	if err := tx.Model(&version).Updates(map[string]any{"status": VersionStatusRejected, "review_reason": reason}).Error; err != nil {
		return err
	}
	return tx.Create(&ResourceReview{VersionID: version.ID, ReviewerID: reviewerID, Decision: VersionStatusRejected, Reason: reason, CreatedAt: time.Now()}).Error
}

// sanitizeTagFilter strips LIKE wildcards and the escape character so a tag
// filter matches the literal tag text; tags never contain these characters.
func sanitizeTagFilter(tag string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case '%', '_', '\\':
			return -1
		}
		return r
	}, tag)
}

// publicResourceSort maps the listing sort parameter to an ORDER BY clause;
// unknown values fall back to the latest-first default.
func publicResourceSort(sort string) string {
	switch sort {
	case "price_asc":
		return "price asc, id desc"
	case "price_desc":
		return "price desc, id desc"
	default:
		return "updated_at desc, id desc"
	}
}

func ListPublicResources(tx *gorm.DB, resourceType, keyword, tag, sort string, offset, limit int) ([]Resource, int64, error) {
	query := tx.Model(&Resource{}).Where("visibility = ? AND status = ?", VisibilityPublic, ResourceStatusPublished)
	if resourceType != "" {
		query = query.Where("type = ?", resourceType)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		query = query.Where("(title LIKE ? OR summary LIKE ?)", "%"+keyword+"%", "%"+keyword+"%")
	}
	// Tags serialize as a JSON string array, so an exact element match is a
	// quoted-substring LIKE; this works identically on SQLite/MySQL/PostgreSQL.
	if tag = sanitizeTagFilter(strings.TrimSpace(tag)); tag != "" {
		query = query.Where("tags LIKE ?", "%\""+tag+"\"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]Resource, 0)
	if err := query.Order(publicResourceSort(sort)).Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func GetResourceMetadata(tx *gorm.DB, resourceID int64) (*Resource, error) {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrResourceNotFound
		}
		return nil, err
	}
	if resource.Status == ResourceStatusDeleted {
		return nil, ErrResourceNotFound
	}
	return &resource, nil
}

func currentApprovedVersion(tx *gorm.DB, resource *Resource) (*ResourceVersion, error) {
	var version ResourceVersion
	if resource.CurrentVersionID != 0 {
		if err := tx.Where("id = ? AND status = ?", resource.CurrentVersionID, VersionStatusApproved).First(&version).Error; err == nil {
			return &version, nil
		}
	}
	if err := tx.Where("resource_id = ? AND status = ?", resource.ID, VersionStatusApproved).Order("version desc").First(&version).Error; err != nil {
		return nil, ErrReviewRequired
	}
	return &version, nil
}

func grantExists(tx *gorm.DB, resourceID int64, userID int) bool {
	var count int64
	tx.Model(&ResourceGrant{}).Where("resource_id = ? AND user_id = ? AND revoked_at IS NULL", resourceID, userID).Count(&count)
	return count > 0
}

func CanReadResource(tx *gorm.DB, resourceID int64, userID int, publicOnly bool) (*Resource, *ResourceVersion, error) {
	resource, err := GetResourceMetadata(tx, resourceID)
	if err != nil {
		return nil, nil, err
	}
	if publicOnly && (resource.Visibility != VisibilityPublic || resource.Status != ResourceStatusPublished) {
		return nil, nil, ErrResourceNotFound
	}
	allowed := userID > 0 && resource.AuthorID == userID
	if !allowed && userID > 0 {
		var share ResourceShare
		allowed = tx.Where("resource_id = ? AND user_id = ? AND revoked_at IS NULL", resourceID, userID).First(&share).Error == nil
	}
	if !allowed && userID > 0 {
		allowed = grantExists(tx, resourceID, userID)
	}
	// Unlisting revokes the public/free channel only: authors, grantees
	// (purchases, claims, shares) keep the access they already hold.
	publicContent := resource.Visibility == VisibilityPublic && resource.Status == ResourceStatusPublished && resource.Price == 0
	if !allowed && publicContent {
		allowed = true
	}
	if !allowed {
		if resource.Status == ResourceStatusUnlisted || resource.Status == ResourceStatusDraft {
			return nil, nil, ErrResourceNotFound
		}
		return nil, nil, ErrResourceForbidden
	}
	version, err := currentApprovedVersion(tx, resource)
	if err != nil {
		return nil, nil, err
	}
	return resource, version, nil
}

func ClaimResource(tx *gorm.DB, resourceID int64, userID int) error {
	resource, err := GetResourceMetadata(tx, resourceID)
	if err != nil {
		return err
	}
	if userID <= 0 || resource.Visibility != VisibilityPublic || resource.Status != ResourceStatusPublished || resource.Price != 0 {
		return ErrInvalidResource
	}
	if resource.AuthorID == userID || grantExists(tx, resourceID, userID) {
		return nil
	}
	if _, err := currentApprovedVersion(tx, resource); err != nil {
		return err
	}
	return tx.Create(&ResourceGrant{ResourceID: resourceID, UserID: userID, Source: SourceClaim, GrantedAt: time.Now()}).Error
}

func selectAuthorShare(tx *gorm.DB, authorID int, setting *MarketplaceSetting) (int64, *RevenueAgreement, error) {
	ratio := setting.BaseShareRatio
	if ratio < 0 || ratio > ShareRatioScale {
		return 0, nil, errors.New("invalid marketplace share ratio")
	}
	var agreements []RevenueAgreement
	if err := tx.Where("enabled = ?", true).Find(&agreements).Error; err != nil {
		return 0, nil, err
	}
	var selected *RevenueAgreement
	now := time.Now()
	for i := range agreements {
		agreement := &agreements[i]
		if agreement.EffectiveAt != nil && now.Before(*agreement.EffectiveAt) {
			continue
		}
		if agreement.ExpiredAt != nil && !now.Before(*agreement.ExpiredAt) {
			continue
		}
		var accepted RevenueAgreementAcceptance
		if err := tx.Where("agreement_id = ? AND user_id = ? AND version = ?", agreement.ID, authorID, agreement.Version).First(&accepted).Error; err != nil {
			continue
		}
		if agreement.ShareRatio > ratio {
			ratio = agreement.ShareRatio
			selected = agreement
		}
	}
	return ratio, selected, nil
}

func PurchaseResource(userID int, resourceID int64, idempotencyKey string) (*ResourceOrder, error) {
	if userID <= 0 || resourceID <= 0 || strings.TrimSpace(idempotencyKey) == "" {
		return nil, ErrInvalidResource
	}
	var order ResourceOrder
	var chargedQuota int
	err := dbx.DB.Transaction(func(tx *gorm.DB) error {
		var existing ResourceOrder
		if err := tx.Where("idempotency_key = ?", idempotencyKey).First(&existing).Error; err == nil {
			if existing.BuyerID != userID || existing.ResourceID != resourceID {
				return errors.New("idempotency key is already used")
			}
			order = existing
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		resource, err := GetResourceMetadata(tx, resourceID)
		if err != nil {
			return err
		}
		var priorOrder ResourceOrder
		if err := tx.Where("resource_id = ? AND buyer_id = ? AND status = ?", resourceID, userID, OrderStatusSuccess).First(&priorOrder).Error; err == nil {
			order = priorOrder
			if !grantExists(tx, resourceID, userID) {
				return tx.Create(&ResourceGrant{ResourceID: resourceID, UserID: userID, Source: SourcePurchase, OrderID: &order.ID, GrantedAt: time.Now()}).Error
			}
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if resource.Visibility != VisibilityPublic || resource.Status != ResourceStatusPublished || resource.Price <= 0 || resource.AuthorID == userID {
			return ErrInvalidResource
		}
		version, err := currentApprovedVersion(tx, resource)
		if err != nil {
			return err
		}
		if grantExists(tx, resourceID, userID) {
			return ErrAlreadyOwned
		}
		setting, err := EnsureMarketplaceSetting(tx)
		if err != nil {
			return err
		}
		ratio, agreement, err := selectAuthorShare(tx, resource.AuthorID, setting)
		if err != nil {
			return err
		}
		if ratio > ShareRatioScale || resource.Price > math.MaxInt64/ShareRatioScale {
			return errors.New("resource price or share ratio is invalid")
		}
		authorAmount := resource.Price * ratio / ShareRatioScale
		platformAmount := resource.Price - authorAmount
		if resource.Currency != CurrencyQuota && resource.Currency != CurrencySpore {
			return ErrInvalidResource
		}
		lockIDs := []int{userID, resource.AuthorID}
		if lockIDs[0] > lockIDs[1] {
			lockIDs[0], lockIDs[1] = lockIDs[1], lockIDs[0]
		}
		for _, id := range lockIDs {
			if _, err := identity.LockUserRow(tx, id); err != nil {
				return err
			}
		}
		if resource.Currency == CurrencyQuota {
			result := identity.UserQuery(tx).Where("id = ? AND quota >= ?", userID, resource.Price).Update("quota", gorm.Expr("quota - ?", resource.Price))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrInsufficientBalance
			}
			chargedQuota = int(resource.Price)
		} else {
			if err := identity.DecreaseUserSporeTx(tx, userID, resource.Price); err != nil {
				return err
			}
		}
		now := time.Now()
		freezeMinutes := setting.IncomeFreezeMinutes
		if freezeMinutes < 0 {
			freezeMinutes = 0
		}
		order = ResourceOrder{IdempotencyKey: idempotencyKey, ResourceID: resourceID, VersionID: version.ID, BuyerID: userID, AuthorID: resource.AuthorID, Amount: resource.Price, Currency: resource.Currency, Status: OrderStatusSuccess, ShareRatio: ratio, CreatedAt: now, CompletedAt: &now}
		if agreement != nil {
			order.AgreementID = &agreement.ID
			order.AgreementVersion = agreement.Version
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		settlement := ResourceSettlement{OrderID: order.ID, AuthorID: resource.AuthorID, AuthorAmount: authorAmount, PlatformAmount: platformAmount, Currency: resource.Currency, CreatedAt: now, ThawAt: now.Add(time.Duration(freezeMinutes) * time.Minute)}
		if err := tx.Create(&settlement).Error; err != nil {
			return err
		}
		return tx.Create(&ResourceGrant{ResourceID: resourceID, UserID: userID, Source: SourcePurchase, OrderID: &order.ID, GrantedAt: now}).Error
	})
	if err != nil {
		return nil, err
	}
	if chargedQuota > 0 {
		if err := quotacache.DecrUser(userID, int64(chargedQuota)); err != nil {
			common.SysLog("failed to sync marketplace buyer quota cache: " + err.Error())
		}
	}
	return &order, nil
}

func ShareResource(tx *gorm.DB, resourceID int64, authorID, userID int) error {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		return err
	}
	if resource.AuthorID != authorID || userID <= 0 || userID == authorID {
		return ErrResourceForbidden
	}
	var target identity.User
	if err := tx.Where("id = ? AND status = ?", userID, common.UserStatusEnabled).First(&target).Error; err != nil {
		return ErrResourceForbidden
	}
	if resource.Status == ResourceStatusDeleted {
		return ErrResourceNotFound
	}
	var share ResourceShare
	if err := tx.Where("resource_id = ? AND user_id = ?", resourceID, userID).First(&share).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		share = ResourceShare{ResourceID: resourceID, UserID: userID, CreatedAt: time.Now()}
		if err := tx.Create(&share).Error; err != nil {
			return err
		}
	} else if share.RevokedAt != nil {
		if err := tx.Model(&share).Update("revoked_at", nil).Error; err != nil {
			return err
		}
	}
	var grant ResourceGrant
	result := tx.Where("resource_id = ? AND user_id = ? AND source = ?", resourceID, userID, SourceShare).Order("id desc").First(&grant)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return tx.Create(&ResourceGrant{ResourceID: resourceID, UserID: userID, Source: SourceShare, GrantedAt: time.Now()}).Error
	}
	if result.Error != nil {
		return result.Error
	}
	return tx.Model(&grant).Updates(map[string]any{"revoked_at": nil, "granted_at": time.Now()}).Error
}

func RevokeResourceShare(tx *gorm.DB, resourceID int64, authorID, userID int) error {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		return err
	}
	if resource.AuthorID != authorID {
		return ErrResourceForbidden
	}
	now := time.Now()
	if err := tx.Model(&ResourceShare{}).Where("resource_id = ? AND user_id = ? AND revoked_at IS NULL", resourceID, userID).Update("revoked_at", now).Error; err != nil {
		return err
	}
	return tx.Model(&ResourceGrant{}).Where("resource_id = ? AND user_id = ? AND source = ? AND revoked_at IS NULL", resourceID, userID, SourceShare).Update("revoked_at", now).Error
}

// AdminListResources returns resources of every status so moderators can act
// on published and unlisted items, not just the pending review queue.
func AdminListResources(tx *gorm.DB, status, keyword string, offset, limit int) ([]Resource, int64, error) {
	query := tx.Model(&Resource{})
	if status != "" {
		if status != ResourceStatusDraft && status != ResourceStatusPublished && status != ResourceStatusUnlisted && status != ResourceStatusDeleted {
			return nil, 0, ErrInvalidResource
		}
		query = query.Where("status = ?", status)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		query = query.Where("(title LIKE ? OR summary LIKE ?)", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]Resource, 0)
	if err := query.Order("updated_at desc, id desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// RepublishResource restores an unlisted resource to the public channel using
// its latest approved version. Grants held by purchasers, claimers, and share
// recipients were never touched by unlisting, so no access needs re-granting.
// ownerID > 0 restricts the operation to that author; 0 allows moderators.
func RepublishResource(tx *gorm.DB, resourceID int64, ownerID int) (*Resource, error) {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrResourceNotFound
		}
		return nil, err
	}
	if ownerID != 0 && resource.AuthorID != ownerID {
		return nil, ErrResourceForbidden
	}
	if resource.Status == ResourceStatusDeleted {
		return nil, ErrResourceNotFound
	}
	if resource.Visibility != VisibilityPublic {
		return nil, ErrInvalidResource
	}
	if resource.Status == ResourceStatusPublished {
		return &resource, nil
	}
	if _, err := currentApprovedVersion(tx, &resource); err != nil {
		return nil, err
	}
	updates := map[string]any{"status": ResourceStatusPublished}
	if resource.CurrentVersionID != 0 {
		updates["current_version_id"] = resource.CurrentVersionID
	} else {
		var latestApproved ResourceVersion
		if err := tx.Where("resource_id = ? AND status = ?", resource.ID, VersionStatusApproved).Order("version desc").First(&latestApproved).Error; err != nil {
			return nil, err
		}
		updates["current_version_id"] = latestApproved.ID
	}
	if err := tx.Model(&resource).Updates(updates).Error; err != nil {
		return nil, err
	}
	return &resource, nil
}

// UpdateResourceMetadata lets the author edit title, summary, tags, price, and
// visibility. Type is intentionally immutable. Moving a non-public resource
// into the public channel resets its current version to reviewing so the
// content passes moderation before it lists again.
func UpdateResourceMetadata(tx *gorm.DB, resourceID int64, authorID int, title, summary, visibility, currency string, price int64, tags []string) (*Resource, error) {
	if authorID <= 0 || strings.TrimSpace(title) == "" || price < 0 {
		return nil, ErrInvalidResource
	}
	if len(title) > 200 || len(summary) > 4000 {
		return nil, ErrInvalidResource
	}
	if visibility != VisibilityPrivate && visibility != VisibilityShared && visibility != VisibilityPublic {
		return nil, ErrInvalidResource
	}
	if price == 0 {
		currency = CurrencyQuota
	}
	if currency != CurrencyQuota && currency != CurrencySpore {
		return nil, ErrInvalidResource
	}
	normalizedTags, err := normalizeResourceTags(tags)
	if err != nil {
		return nil, err
	}
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrResourceNotFound
		}
		return nil, err
	}
	if resource.AuthorID != authorID {
		return nil, ErrResourceForbidden
	}
	updates := map[string]any{
		"title":      strings.TrimSpace(title),
		"summary":    summary,
		"tags":       normalizedTags,
		"visibility": visibility,
		"price":      price,
		"currency":   currency,
	}
	if err := tx.Model(&resource).Updates(updates).Error; err != nil {
		return nil, err
	}
	if visibility == VisibilityPublic && resource.Visibility != VisibilityPublic {
		if resource.CurrentVersionID != 0 {
			if err := tx.Model(&ResourceVersion{}).Where("id = ?", resource.CurrentVersionID).Update("status", VersionStatusReviewing).Error; err != nil {
				return nil, err
			}
		}
		if err := tx.Model(&resource).Update("status", ResourceStatusDraft).Error; err != nil {
			return nil, err
		}
	}
	var updated Resource
	if err := tx.First(&updated, resourceID).Error; err != nil {
		return nil, err
	}
	return &updated, nil
}

// AcquiredResource pairs a resource the viewer holds a grant for with the way
// it was acquired (claim, purchase, or share).
type AcquiredResource struct {
	Resource
	Source string `json:"source"`
}

// ListUserAcquiredResources lists resources the user gained through claim,
// purchase, or share; authored resources are excluded because they already
// appear in the author list.
func ListUserAcquiredResources(tx *gorm.DB, userID, offset, limit int) ([]AcquiredResource, int64, error) {
	heldGrants := tx.Model(&ResourceGrant{}).Select("resource_id").Where("user_id = ? AND revoked_at IS NULL AND source <> ?", userID, SourceAuthor)
	query := tx.Model(&Resource{}).Where("id IN (?)", heldGrants)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]Resource, 0)
	if err := query.Order("updated_at desc, id desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	result := make([]AcquiredResource, 0, len(items))
	if len(items) == 0 {
		return result, total, nil
	}
	ids := make([]int64, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	var grantRows []ResourceGrant
	if err := tx.Where("user_id = ? AND revoked_at IS NULL AND source <> ? AND resource_id IN ?", userID, SourceAuthor, ids).Order("id asc").Find(&grantRows).Error; err != nil {
		return nil, 0, err
	}
	sourceByResource := make(map[int64]string, len(grantRows))
	for _, grant := range grantRows {
		if _, exists := sourceByResource[grant.ResourceID]; !exists {
			sourceByResource[grant.ResourceID] = grant.Source
		}
	}
	for _, item := range items {
		result = append(result, AcquiredResource{Resource: item, Source: sourceByResource[item.ID]})
	}
	return result, total, nil
}

// ListResourceVersionsForAuthor exposes the author's own version history with
// review status and rejection reasons; content payloads stay out of the list.
func ListResourceVersionsForAuthor(tx *gorm.DB, resourceID int64, authorID, offset, limit int) ([]ResourceVersion, int64, error) {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, 0, ErrResourceNotFound
		}
		return nil, 0, err
	}
	if int64(resource.AuthorID) != int64(authorID) {
		return nil, 0, ErrResourceForbidden
	}
	query := tx.Model(&ResourceVersion{}).Where("resource_id = ?", resourceID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]ResourceVersion, 0)
	if err := query.
		Select("id, resource_id, version, format, content_hash, status, review_reason, created_at, updated_at").
		Order("version desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// SetRevenueAgreementEnabled toggles an agreement's availability. Disabled
// agreements disappear from the author list and cannot be accepted, while
// historical acceptances and order snapshots stay untouched.
func SetRevenueAgreementEnabled(tx *gorm.DB, agreementID int64, enabled bool) (*RevenueAgreement, error) {
	var agreement RevenueAgreement
	if err := tx.First(&agreement, agreementID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrResourceNotFound
		}
		return nil, err
	}
	if err := tx.Model(&agreement).Update("enabled", enabled).Error; err != nil {
		return nil, err
	}
	agreement.Enabled = enabled
	return &agreement, nil
}

// ListResourceShares returns the author's share rows for a resource, including
// revoked ones, so the owner can audit who had access and when.
func ListResourceShares(tx *gorm.DB, resourceID int64, authorID int) ([]ResourceShare, error) {
	var resource Resource
	if err := tx.First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrResourceNotFound
		}
		return nil, err
	}
	if resource.AuthorID != authorID {
		return nil, ErrResourceForbidden
	}
	items := make([]ResourceShare, 0)
	if err := tx.Where("resource_id = ?", resourceID).Order("created_at desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}
