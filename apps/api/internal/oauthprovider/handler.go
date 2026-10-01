package oauthprovider

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/internal/common"
	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/identity"
	"github.com/QuantumNous/new-api/internal/identity/policy"
	"github.com/QuantumNous/new-api/internal/security"
	"github.com/QuantumNous/new-api/internal/transport/contract"
	"github.com/QuantumNous/new-api/internal/transport/middleware"
	"gorm.io/gorm"
)

const issuerFallback = "http://localhost:3000"

func issuer() string {
	if identity.OnResolveServerAddress != nil && strings.TrimSpace(identity.OnResolveServerAddress()) != "" {
		return strings.TrimRight(identity.OnResolveServerAddress(), "/")
	}
	return issuerFallback
}

func RegisterStandardRoutes(router contract.Routes) {
	router.GET("/.well-known/openid-configuration", middleware.DisableCache(), DiscoveryHandler)
	router.GET("/oauth2/jwks", middleware.DisableCache(), JWKSHandler)
	router.GET("/oauth2/authorize", middleware.CriticalRateLimit(), middleware.DisableCache(), AuthorizeHandler)
	router.POST("/oauth2/token", middleware.CriticalRateLimit(), middleware.DisableCache(), TokenHandler)
	router.GET("/oauth2/userinfo", middleware.CriticalRateLimit(), middleware.DisableCache(), UserInfoHandler)
	router.POST("/oauth2/revoke", middleware.CriticalRateLimit(), middleware.DisableCache(), RevokeHandler)
}

func RegisterAPIRoutes(apiRouter contract.Routes) {
	admin := apiRouter.Group("/oauth2/admin")
	admin.Use(security.AdminAuth())
	{
		admin.GET("/clients", middleware.DisableCache(), security.RequirePermission(policy.OAuthClientsRead), ListClientsHandler)
		admin.POST("/clients", middleware.CriticalRateLimit(), middleware.DisableCache(), security.RequirePermission(policy.OAuthClientsManage), CreateClientHandler)
		admin.POST("/clients/:client_id/disable", middleware.CriticalRateLimit(), middleware.DisableCache(), security.RequirePermission(policy.OAuthClientsManage), DisableClientHandler)
		admin.POST("/clients/:client_id/enable", middleware.CriticalRateLimit(), middleware.DisableCache(), security.RequirePermission(policy.OAuthClientsManage), EnableClientHandler)
		admin.POST("/clients/:client_id/secret", middleware.CriticalRateLimit(), middleware.DisableCache(), security.RequirePermission(policy.OAuthClientsManage), RotateClientSecretHandler)
		admin.POST("/keys/rotate", middleware.CriticalRateLimit(), middleware.DisableCache(), security.RequirePermission(policy.OAuthKeysRotate), RotateKeyHandler)
	}

	consent := apiRouter.Group("/oauth2/consent")
	consent.Use(security.TryUserAuth())
	{
		consent.GET("/", middleware.DisableCache(), GetConsentHandler)
		consent.POST("/", middleware.CriticalRateLimit(), middleware.DisableCache(), security.SessionCookieOriginGuard(), CompleteConsentHandler)
	}
}

func DiscoveryHandler(c contract.Context) {
	base := issuer()
	_ = c.JSON(http.StatusOK, common.H{"issuer": base, "authorization_endpoint": base + "/oauth2/authorize", "token_endpoint": base + "/oauth2/token", "userinfo_endpoint": base + "/oauth2/userinfo", "jwks_uri": base + "/oauth2/jwks", "revocation_endpoint": base + "/oauth2/revoke", "response_types_supported": []string{"code"}, "grant_types_supported": []string{"authorization_code"}, "subject_types_supported": []string{"pairwise"}, "id_token_signing_alg_values_supported": []string{"RS256"}, "scopes_supported": []string{ScopeOpenID, ScopeProfile, ScopeEmail}, "token_endpoint_auth_methods_supported": []string{"client_secret_post", "none"}, "code_challenge_methods_supported": []string{"S256"}})
}

func JWKSHandler(c contract.Context) {
	keys, err := JWKS(dbx.DB)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	_ = c.JSON(http.StatusOK, common.H{"keys": keys})
}

func AuthorizeHandler(c contract.Context) {
	if c.Query("response_type") != "code" {
		redirectOAuthError(c, "", "unsupported_response_type", "only code is supported")
		return
	}
	clientID, redirectURI, scope, challenge, method, nonce := c.Query("client_id"), c.Query("redirect_uri"), c.Query("scope"), c.Query("code_challenge"), c.Query("code_challenge_method"), c.Query("nonce")
	var client OAuthClient
	if err := dbx.DB.Where("client_id = ? AND enabled = ?", clientID, true).First(&client).Error; err != nil {
		common.CtxApiErrorMsg(c, "invalid client")
		return
	}
	if !redirectAllowed(&client, redirectURI) {
		common.CtxApiErrorMsg(c, "invalid redirect URI")
		return
	}
	normalized, requested, err := normalizeScopes(scope)
	if err != nil || !scopesAllowed(&client, requested) {
		redirectOAuthError(c, redirectURI, "invalid_scope", "scope is not allowed")
		return
	}
	if method != "S256" || challenge == "" || (contains(requested, ScopeOpenID) && nonce == "") {
		redirectOAuthError(c, redirectURI, "invalid_request", "PKCE and nonce are required")
		return
	}
	consentID, err := randomURLValue(24)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	// Opportunistic housekeeping: this endpoint is rate limited, so piggyback
	// the purge of long-expired consent rows to keep the table bounded.
	if err := dbx.DB.Where("expires_at < ?", time.Now().Add(-24*time.Hour)).Delete(&OAuthConsentRequest{}).Error; err != nil {
		common.SysLog("failed to purge expired oauth consent requests: " + err.Error())
	}
	request := &OAuthConsentRequest{ID: consentID, ClientID: clientID, RedirectURI: redirectURI, Scope: normalized, State: c.Query("state"), CodeChallenge: challenge, CodeChallengeMethod: method, Nonce: nonce, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(10 * time.Minute)}
	if err := dbx.DB.Create(request).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	setConsentCookie(c, consentID, request.ExpiresAt)
	location := "/oauth2/consent?request=" + url.QueryEscape(consentID)
	c.Redirect(http.StatusFound, location)
}

func GetConsentHandler(c contract.Context) {
	if _, ok := security.GetSessionAuthIdentity(c); !ok {
		common.CtxApiErrorMsg(c, "login required")
		return
	}
	requestID := c.Query("request")
	if !consentCookieMatches(c, requestID) {
		common.CtxApiErrorMsg(c, "invalid consent transaction")
		return
	}
	var request OAuthConsentRequest
	if err := dbx.DB.Where("id = ? AND expires_at > ?", requestID, time.Now()).First(&request).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	var client OAuthClient
	if err := dbx.DB.Where("client_id = ? AND enabled = ?", request.ClientID, true).First(&client).Error; err != nil {
		common.CtxApiError(c, ErrInvalidClient)
		return
	}
	common.CtxApiSuccess(c, common.H{"id": request.ID, "client_name": client.Name, "client_id": client.ClientID, "scope": strings.Fields(request.Scope), "redirect_uri": request.RedirectURI})
}

func CompleteConsentHandler(c contract.Context) {
	authIdentity, ok := security.GetSessionAuthIdentity(c)
	if !ok {
		common.CtxApiErrorMsg(c, "login required")
		return
	}
	requestID := c.Query("request")
	if !consentCookieMatches(c, requestID) {
		common.CtxApiErrorMsg(c, "invalid consent transaction")
		return
	}
	var request OAuthConsentRequest
	if err := dbx.DB.Where("id = ? AND expires_at > ?", requestID, time.Now()).First(&request).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	if request.UserID != 0 && request.UserID != authIdentity.UserID {
		common.CtxApiErrorMsg(c, "consent request belongs to another session")
		return
	}
	var code string
	var err error
	if c.Query("approve") == "true" {
		err = dbx.DB.Transaction(func(tx *gorm.DB) error {
			locked := OAuthConsentRequest{}
			if err := dbx.LockForUpdate(tx).Where("id = ? AND expires_at > ?", request.ID, time.Now()).First(&locked).Error; err != nil {
				return err
			}
			if locked.UserID != 0 && locked.UserID != authIdentity.UserID {
				return errors.New("consent request belongs to another session")
			}
			if err := tx.Model(&locked).Update("user_id", authIdentity.UserID).Error; err != nil {
				return err
			}
			code, err = CreateAuthorizationCode(tx, locked.ClientID, authIdentity.UserID, locked.RedirectURI, locked.Scope, locked.CodeChallenge, locked.CodeChallengeMethod, locked.Nonce)
			if err != nil {
				return err
			}
			return tx.Delete(&locked).Error
		})
		if err != nil {
			common.CtxApiError(c, err)
			return
		}
	} else {
		params := url.Values{"error": []string{"access_denied"}, "error_description": []string{"the user denied access"}}
		if request.State != "" {
			params.Set("state", request.State)
		}
		_ = dbx.DB.Delete(&request).Error
		common.CtxApiSuccess(c, common.H{"redirect_uri": request.RedirectURI + "?" + params.Encode()})
		return
	}
	params := url.Values{"code": []string{code}}
	if request.State != "" {
		params.Set("state", request.State)
	}
	common.CtxApiSuccess(c, common.H{"redirect_uri": request.RedirectURI + "?" + params.Encode()})
}

func TokenHandler(c contract.Context) {
	if c.PostForm("grant_type") != "authorization_code" {
		oauthJSONError(c, http.StatusBadRequest, "unsupported_grant_type", "only authorization_code is supported")
		return
	}
	clientID, secret := c.PostForm("client_id"), c.PostForm("client_secret")
	client, err := ValidateClient(dbx.DB, clientID, secret, c.PostForm("redirect_uri"))
	if err != nil {
		oauthJSONError(c, http.StatusUnauthorized, "invalid_client", "invalid client")
		return
	}
	var code *OAuthAuthorizationCode
	err = dbx.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		code, err = ConsumeAuthorizationCode(tx, c.PostForm("code"), client.ClientID, c.PostForm("redirect_uri"), c.PostForm("code_verifier"))
		return err
	})
	if err != nil {
		oauthJSONError(c, http.StatusBadRequest, "invalid_grant", "invalid authorization code")
		return
	}
	var rawToken string
	var token *OAuthAccessToken
	err = dbx.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		rawToken, token, err = CreateAccessToken(tx, client.ClientID, code.UserID, code.Scope)
		return err
	})
	if err != nil {
		oauthJSONError(c, http.StatusInternalServerError, "server_error", "unable to issue token")
		return
	}
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	if err := dbx.DB.Where("expires_at < ?", cutoff).Delete(&OAuthAccessToken{}).Error; err != nil {
		common.SysLog("failed to purge expired oauth access tokens: " + err.Error())
	}
	if err := dbx.DB.Where("status = ? AND expires_at < ?", AuthorizationCodeStatusUsed, cutoff).Delete(&OAuthAuthorizationCode{}).Error; err != nil {
		common.SysLog("failed to purge consumed oauth authorization codes: " + err.Error())
	}
	response := common.H{"access_token": rawToken, "token_type": "Bearer", "expires_in": int(time.Until(token.ExpiresAt).Seconds()), "scope": token.Scope}
	if contains(strings.Fields(code.Scope), ScopeOpenID) {
		user, userErr := identity.GetUserById(code.UserID, false)
		if userErr != nil {
			oauthJSONError(c, http.StatusInternalServerError, "server_error", "unable to load user")
			return
		}
		idToken, expires, idErr := IssueIDToken(dbx.DB, issuer(), client, user, code.Scope, code.Nonce)
		if idErr != nil {
			oauthJSONError(c, http.StatusInternalServerError, "server_error", "unable to issue ID token")
			return
		}
		response["id_token"] = idToken
		response["id_token_expires_at"] = expires
	}
	_ = c.JSON(http.StatusOK, response)
}

func UserInfoHandler(c contract.Context) {
	raw := bearerToken(c.Header("Authorization"))
	if raw == "" {
		oauthJSONError(c, http.StatusUnauthorized, "invalid_token", "bearer token required")
		return
	}
	token, err := LoadAccessToken(dbx.DB, raw)
	if err != nil {
		oauthJSONError(c, http.StatusUnauthorized, "invalid_token", "invalid access token")
		return
	}
	user, err := identity.GetUserById(token.UserID, false)
	if err != nil {
		oauthJSONError(c, http.StatusUnauthorized, "invalid_token", "user unavailable")
		return
	}
	claims := common.H{"sub": SubjectForUser(issuer(), token.ClientID, user.Id)}
	if IsScopeAllowed(token.Scope, ScopeProfile) {
		claims["preferred_username"] = user.Username
		claims["name"] = user.DisplayName
	}
	if IsScopeAllowed(token.Scope, ScopeEmail) && user.Email != "" {
		claims["email"] = user.Email
		claims["email_verified"] = false
	}
	_ = c.JSON(http.StatusOK, claims)
}

func RevokeHandler(c contract.Context) {
	_ = RevokeAccessToken(dbx.DB, bearerToken(c.Header("Authorization")))
	_ = c.JSON(http.StatusOK, common.H{})
}

func ListClientsHandler(c contract.Context) {
	var clients []OAuthClient
	if err := dbx.DB.Order("id desc").Find(&clients).Error; err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, clients)
}

func CreateClientHandler(c contract.Context) {
	var req struct {
		Name         string   `json:"name"`
		ClientType   string   `json:"client_type"`
		RedirectURIs []string `json:"redirect_uris"`
		Scopes       []string `json:"scopes"`
	}
	if err := c.BindJSON(&req); err != nil {
		common.CtxApiError(c, err)
		return
	}
	client, secret, err := CreateClient(dbx.DB, c.GetInt("id"), req.Name, req.ClientType, req.RedirectURIs, req.Scopes)
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, common.H{"client": client, "client_secret": secret})
}

func RotateKeyHandler(c contract.Context) {
	var key *OAuthSigningKey
	err := dbx.DB.Transaction(func(tx *gorm.DB) error { var err error; key, err = RotateSigningKey(tx); return err })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, key)
}

func DisableClientHandler(c contract.Context) {
	clientLifecycle(c, false)
}

func EnableClientHandler(c contract.Context) {
	clientLifecycle(c, true)
}

func clientLifecycle(c contract.Context, enabled bool) {
	clientID := c.Param("client_id")
	err := dbx.DB.Transaction(func(tx *gorm.DB) error { return SetClientEnabled(tx, clientID, enabled) })
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, nil)
}

func RotateClientSecretHandler(c contract.Context) {
	clientID := c.Param("client_id")
	var client *OAuthClient
	var secret string
	err := dbx.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		client, secret, err = RotateClientSecret(tx, clientID)
		return err
	})
	if err != nil {
		common.CtxApiError(c, err)
		return
	}
	common.CtxApiSuccess(c, common.H{"client": client, "client_secret": secret})
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}
func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
func redirectOAuthError(c contract.Context, redirectURI, code, description string, states ...string) {
	if redirectURI == "" {
		common.CtxApiErrorMsg(c, description)
		return
	}
	params := url.Values{"error": []string{code}, "error_description": []string{description}}
	if len(states) > 0 && states[0] != "" {
		params.Set("state", states[0])
	}
	c.Redirect(http.StatusFound, redirectURI+"?"+params.Encode())
}
func oauthJSONError(c contract.Context, status int, code, description string) {
	_ = c.JSON(status, common.H{"error": code, "error_description": description})
}
