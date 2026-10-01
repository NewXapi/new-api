package oauthprovider

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/transport/contract"
)

const consentCookieName = "oauth2_consent_tx"

func consentCookieValue(requestID string) string {
	return common.GenerateHMAC("oauth2-consent-v1:" + requestID)
}

func setConsentCookie(c contract.Context, requestID string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	if maxAge < 1 {
		maxAge = 1
	}
	c.SetCookie(&http.Cookie{
		Name:     consentCookieName,
		Value:    requestID + "." + consentCookieValue(requestID),
		Path:     "/",
		MaxAge:   maxAge,
		Expires:  expires,
		HttpOnly: true,
		Secure:   common.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func consentCookieMatches(c contract.Context, requestID string) bool {
	value, err := c.Cookie(consentCookieName)
	return err == nil && value == requestID+"."+consentCookieValue(requestID)
}
