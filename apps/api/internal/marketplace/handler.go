package marketplace

import (
	"encoding/base64"
	"strconv"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/identity/policy"
	"github.com/QuantumNous/new-api/internal/security"
	"github.com/QuantumNous/new-api/internal/transport/contract"
	"gorm.io/gorm"
)

type createResourceRequest struct {
	Type       string `json:"type"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Visibility string `json:"visibility"`
	Currency   string `json:"currency"`
	Price      int64  `json:"price"`
}

type addVersionRequest struct {
	Format  string `json:"format"`
	Content string `json:"content"`
	Data    string `json:"data"`
}

type shareRequest struct {
	UserID int `json:"user_id"`
}

type reviewRequest struct {
	Approve bool   `json:"approve"`
	Reason  string `json:"reason"`
}

func SetApiRouter(apiRouter contract.Routes) {
	market := apiRouter.Group("/marketplace")
	market.GET("/resources", ListResources)
	market.GET("/resources/:id", GetResourceMetadataHandler)
	market.GET("/resources/:id/content", GetResourceContentHandler)
	market.GET("/resources/:id/download", DownloadResourceContentHandler)

	user := market.Group("/user")
	user.Use(security.UserAuth())
	{
		user.GET("/resources", GetMyResourcesHandler)
		user.GET("/orders", GetMyOrdersHandler)
		user.GET("/agreements", ListActiveAgreementsHandler)
		user.POST("/agreements/:id/accept", AcceptAgreementHandler)
		user.POST("/resources", CreateResourceHandler)
		user.POST("/resources/:id/versions", AddVersionHandler)
		user.POST("/resources/:id/claim", ClaimResourceHandler)
		user.POST("/resources/:id/purchase", PurchaseResourceHandler)
		user.POST("/resources/:id/share", ShareResourceHandler)
		user.DELETE("/resources/:id/share/:user_id", RevokeShareHandler)
	}

	admin := market.Group("/admin")
	admin.Use(security.AdminAuth())
	{
		admin.GET("/reviews", security.RequirePermission(policy.MarketplaceReview), ListReviewsHandler)
		admin.POST("/versions/:id/review", security.RequirePermission(policy.MarketplaceReview), ReviewVersionHandler)
		admin.POST("/resources/:id/unlist", security.RequirePermission(policy.MarketplaceUnlist), UnlistResourceHandler)
		admin.GET("/settings", security.RequirePermission(policy.MarketplaceConfiguration), GetMarketplaceSettingsHandler)
		admin.PUT("/settings", security.RequirePermission(policy.MarketplaceConfiguration), UpdateMarketplaceSettingsHandler)
		admin.GET("/agreements", security.RequirePermission(policy.MarketplaceAgreement), ListAgreementsHandler)
		admin.POST("/agreements", security.RequirePermission(policy.MarketplaceAgreement), CreateAgreementHandler)
		admin.GET("/orders", security.RequirePermission(policy.MarketplaceTrade), ListOrdersHandler)
	}
}

func ListResources(c contract.Context) {
	page := common.GetPageQuery(c)
	items, total, err := ListPublicResources(dbx.DB, c.Query("type"), c.Query("keyword"), page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.CtxApiSuccess(c, page)
}

func CreateResourceHandler(c contract.Context) {
	var req createResourceRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	var resource *Resource
	err := dbx.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		resource, err = CreateResource(tx, c.GetInt("id"), req.Type, req.Title, req.Summary, req.Visibility, req.Currency, req.Price)
		return err
	})
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, resource)
}

func AddVersionHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	var req addVersionRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	data := []byte(req.Content)
	if req.Data != "" {
		data, err = base64.StdEncoding.DecodeString(req.Data)
		if err != nil {
			common.CtxApiError(c, err)
			return
		}
	}
	var version *ResourceVersion
	err = dbx.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		version, err = AddResourceVersion(tx, id, int64(c.GetInt("id")), req.Format, data)
		return err
	})
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, version)
}

func ClaimResourceHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	err = dbx.DB.Transaction(func(tx *gorm.DB) error { return ClaimResource(tx, id, c.GetInt("id")) })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func PurchaseResourceHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	key := c.Header("Idempotency-Key")
	if key == "" {
		common.CtxApiErrorMsg(c, "缺少 Idempotency-Key")
		return
	}
	order, err := PurchaseResource(c.GetInt("id"), id, key)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, order)
}

func ShareResourceHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	var req shareRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	err = dbx.DB.Transaction(func(tx *gorm.DB) error { return ShareResource(tx, id, c.GetInt("id"), req.UserID) })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func RevokeShareHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	userID, userErr := strconv.Atoi(c.Param("user_id"))
	if err != nil || userErr != nil {
		common.CtxApiErrorMsg(c, "参数无效")
		return
	}
	err = dbx.DB.Transaction(func(tx *gorm.DB) error { return RevokeResourceShare(tx, id, c.GetInt("id"), userID) })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func ReviewVersionHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	var req reviewRequest
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	err = dbx.DB.Transaction(func(tx *gorm.DB) error {
		if req.Approve {
			return ApproveResourceVersion(tx, c.GetInt("id"), id)
		}
		return RejectResourceVersion(tx, c.GetInt("id"), id, req.Reason)
	})
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func UnlistResourceHandler(c contract.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	result := dbx.DB.Model(&Resource{}).Where("id = ?", id).Update("status", ResourceStatusUnlisted)
	if result.Error != nil {
		common.CtxApiError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		common.CtxApiError(c, ErrResourceNotFound)
		return
	}
	common.CtxApiSuccess(c, nil)
}
