package marketplace

import (
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/common/quotacache"
	"github.com/QuantumNous/new-api/internal/identity"
	"gorm.io/gorm"
)

// ListUserSettlements returns the author income ledger rows for one user.
func ListUserSettlements(tx *gorm.DB, userID, offset, limit int) ([]ResourceSettlement, int64, error) {
	query := tx.Model(&ResourceSettlement{}).Where("author_id = ?", userID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]ResourceSettlement, 0)
	if err := query.Order("created_at desc, id desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// ExchangeMarketplaceIncome moves every thawed, not-yet-exchanged settlement of
// the user into their balance (quota or spore, per settlement currency). The
// call is manual by design; concurrent calls are serialized by row locks and
// the exchanged_at stamp, so income is credited exactly once.
func ExchangeMarketplaceIncome(userID int) (int, int64, int64, error) {
	var exchangedCount int
	var quotaTotal, sporeTotal int64
	err := dbx.DB.Transaction(func(tx *gorm.DB) error {
		if _, err := identity.LockUserRow(tx, userID); err != nil {
			return err
		}
		var rows []ResourceSettlement
		if err := dbx.LockForUpdate(tx).
			Where("author_id = ? AND exchanged_at IS NULL AND thaw_at <= ?", userID, time.Now()).
			Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for _, row := range rows {
			if row.Currency == CurrencySpore {
				sporeTotal += row.AuthorAmount
			} else {
				quotaTotal += row.AuthorAmount
			}
		}
		if quotaTotal > 0 {
			if err := identity.UserQuery(tx).Where("id = ?", userID).Update("quota", gorm.Expr("quota + ?", quotaTotal)).Error; err != nil {
				return err
			}
		}
		if sporeTotal > 0 {
			if err := identity.UserQuery(tx).Where("id = ?", userID).Update("spore", gorm.Expr("spore + ?", sporeTotal)).Error; err != nil {
				return err
			}
		}
		ids := make([]int64, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
		if err := tx.Model(&ResourceSettlement{}).Where("id IN ?", ids).Update("exchanged_at", time.Now()).Error; err != nil {
			return err
		}
		exchangedCount = len(rows)
		return nil
	})
	if err != nil {
		return 0, 0, 0, err
	}
	if quotaTotal > 0 {
		if err := quotacache.IncrUser(userID, quotaTotal); err != nil {
			common.SysLog("failed to sync marketplace exchange quota cache: " + err.Error())
		}
	}
	return exchangedCount, quotaTotal, sporeTotal, nil
}
