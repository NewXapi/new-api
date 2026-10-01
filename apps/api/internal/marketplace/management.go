package marketplace

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

func UpdateMarketplaceSetting(tx *gorm.DB, maxUploadBytes, baseShareRatio int64) (*MarketplaceSetting, error) {
	if maxUploadBytes <= 0 || baseShareRatio < 0 || baseShareRatio > ShareRatioScale {
		return nil, errors.New("invalid marketplace setting")
	}
	var setting MarketplaceSetting
	if err := tx.First(&setting).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		setting = MarketplaceSetting{MaxUploadBytes: maxUploadBytes, BaseShareRatio: baseShareRatio}
		if err := tx.Create(&setting).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else if err := tx.Model(&setting).Updates(map[string]any{"max_upload_bytes": maxUploadBytes, "base_share_ratio": baseShareRatio}).Error; err != nil {
		return nil, err
	} else {
		setting.MaxUploadBytes = maxUploadBytes
		setting.BaseShareRatio = baseShareRatio
	}
	_ = SetMaxUploadBytes(maxUploadBytes)
	return &setting, nil
}

func ListReviewVersions(tx *gorm.DB, offset, limit int) ([]ResourceVersion, int64, error) {
	query := tx.Model(&ResourceVersion{}).Where("status = ?", VersionStatusReviewing)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]ResourceVersion, 0)
	if err := query.Order("created_at asc, id asc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func ListUserResources(tx *gorm.DB, userID, offset, limit int) ([]Resource, int64, error) {
	query := tx.Model(&Resource{}).Where("author_id = ?", userID)
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

func ListUserOrders(tx *gorm.DB, userID, offset, limit int) ([]ResourceOrder, int64, error) {
	query := tx.Model(&ResourceOrder{}).Where("buyer_id = ?", userID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]ResourceOrder, 0)
	if err := query.Order("created_at desc, id desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func CreateRevenueAgreement(tx *gorm.DB, name, version, body string, shareRatio int64, effectiveAt, expiredAt *time.Time) (*RevenueAgreement, error) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(version) == "" || strings.TrimSpace(body) == "" || shareRatio < 0 || shareRatio > ShareRatioScale {
		return nil, errors.New("invalid revenue agreement")
	}
	agreement := &RevenueAgreement{Name: strings.TrimSpace(name), Version: strings.TrimSpace(version), Body: body, ShareRatio: shareRatio, Enabled: true, EffectiveAt: effectiveAt, ExpiredAt: expiredAt}
	if err := tx.Create(agreement).Error; err != nil {
		return nil, err
	}
	return agreement, nil
}

func AcceptRevenueAgreement(tx *gorm.DB, userID int, agreementID int64) error {
	var agreement RevenueAgreement
	if err := tx.Where("id = ? AND enabled = ?", agreementID, true).First(&agreement).Error; err != nil {
		return err
	}
	now := time.Now()
	if agreement.EffectiveAt != nil && now.Before(*agreement.EffectiveAt) {
		return errors.New("agreement is not effective")
	}
	if agreement.ExpiredAt != nil && !now.Before(*agreement.ExpiredAt) {
		return errors.New("agreement has expired")
	}
	var acceptance RevenueAgreementAcceptance
	result := tx.Where("agreement_id = ? AND user_id = ?", agreementID, userID).First(&acceptance)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return tx.Create(&RevenueAgreementAcceptance{AgreementID: agreementID, UserID: userID, Version: agreement.Version, AcceptedAt: now}).Error
	}
	if result.Error != nil {
		return result.Error
	}
	return tx.Model(&acceptance).Updates(map[string]any{"version": agreement.Version, "accepted_at": now}).Error
}
