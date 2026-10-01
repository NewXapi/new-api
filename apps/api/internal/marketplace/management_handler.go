package marketplace

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/transport/contract"
	"gorm.io/gorm"
)

type settingRequest struct {
	MaxUploadBytes int64 `json:"max_upload_bytes"`
	BaseShareRatio int64 `json:"base_share_ratio"`
}

type agreementRequest struct {
	Name        string     `json:"name"`
	Version     string     `json:"version"`
	Body        string     `json:"body"`
	ShareRatio  int64      `json:"share_ratio"`
	EffectiveAt *time.Time `json:"effective_at"`
	ExpiredAt   *time.Time `json:"expired_at"`
}

func GetResourceMetadataHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	resource, err := GetResourceMetadata(dbx.DB, id)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	if resource.Visibility != VisibilityPublic || resource.Status != ResourceStatusPublished {
		if c.GetInt("id") <= 0 || c.GetInt("id") != resource.AuthorID {
			// Grant holders (share/claim/purchase) keep metadata access, e.g.
			// when a resource they own has been unlisted.
			if _, _, err := CanReadResource(dbx.DB, id, c.GetInt("id"), false); err != nil {
				common.CtxApiError(c, ErrResourceNotFound)
				return
			}
		}
	}
	common.CtxApiSuccess(c, resource)
}

func GetResourceContentHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	resource, version, err := CanReadResource(dbx.DB, id, c.GetInt("id"), c.GetInt("id") == 0)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, common.H{"resource": resource, "version": version, "mobile_fields": mobileFieldsForVersion(resource, version)})
}

func DownloadResourceContentHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	resource, version, err := CanReadResource(dbx.DB, id, c.GetInt("id"), c.GetInt("id") == 0)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	c.SetHeader("X-Content-Type-Options", "nosniff")
	c.SetHeader("Content-Disposition", `attachment; filename="resource-content"`)
	if version.Format == FormatCharacterCardPNG {
		if len(version.PNGData) == 0 {
			common.CtxApiError(c, ErrResourceNotFound)
			return
		}
		_ = c.Data(200, "image/png", version.PNGData)
		return
	}
	contentType := "text/plain; charset=utf-8"
	if resource.Type == ResourceTypeTutorial {
		contentType = "text/markdown; charset=utf-8"
	}
	_ = c.Data(200, contentType, []byte(version.Content))
}

func mobileFieldsForVersion(resource *Resource, version *ResourceVersion) map[string]string {
	if resource.Type != ResourceTypeCharacterCard || version.NormalizedJSON == "" {
		return nil
	}
	var card CharacterCard
	if common.Unmarshal([]byte(version.NormalizedJSON), &card.Raw) != nil {
		return nil
	}
	return MobileCharacterFields(card)
}

func GetMyResourcesHandler(c contract.Context) {
	page := common.GetPageQuery(c)
	items, total, err := ListUserResources(dbx.DB, c.GetInt("id"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.CtxApiSuccess(c, page)
}

func GetMyOrdersHandler(c contract.Context) {
	page := common.GetPageQuery(c)
	items, total, err := ListUserOrders(dbx.DB, c.GetInt("id"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.CtxApiSuccess(c, page)
}

func ListReviewsHandler(c contract.Context) {
	page := common.GetPageQuery(c)
	items, total, err := ListReviewVersions(dbx.DB, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.CtxApiSuccess(c, page)
}

func GetMarketplaceSettingsHandler(c contract.Context) {
	setting, err := EnsureMarketplaceSetting(dbx.DB)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, setting)
}

func UpdateMarketplaceSettingsHandler(c contract.Context) {
	var req settingRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	setting, err := UpdateMarketplaceSetting(dbx.DB, req.MaxUploadBytes, req.BaseShareRatio)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, setting)
}

func ListActiveAgreementsHandler(c contract.Context) {
	items := make([]RevenueAgreement, 0)
	result := dbx.DB.Where("enabled = ?", true).Order("share_ratio asc, id asc").Find(&items)
	if result.Error != nil {
		common.CtxApiError(c, result.Error)
		return
	}
	common.CtxApiSuccess(c, items)
}

func AcceptAgreementHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	err = dbx.DB.Transaction(func(tx *gorm.DB) error { return AcceptRevenueAgreement(tx, c.GetInt("id"), id) })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func ListAgreementsHandler(c contract.Context) {
	items := make([]RevenueAgreement, 0)
	if err := dbx.DB.Order("id desc").Find(&items).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, items)
}

func CreateAgreementHandler(c contract.Context) {
	var req agreementRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	agreement, err := CreateRevenueAgreement(dbx.DB, req.Name, req.Version, req.Body, req.ShareRatio, req.EffectiveAt, req.ExpiredAt)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, agreement)
}

func ListOrdersHandler(c contract.Context) {
	page := common.GetPageQuery(c)
	query := dbx.DB.Model(&ResourceOrder{})
	if buyer := c.Query("buyer_id"); buyer != "" {
		id, err := strconv.Atoi(buyer)
		if err != nil {
			common.CtxApiError(c, err)
			return
		}
		query = query.Where("buyer_id = ?", id)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	items := make([]ResourceOrder, 0)
	if err := query.Order("created_at desc, id desc").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&items).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.CtxApiSuccess(c, page)
}
