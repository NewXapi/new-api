package policy

const (
	ResourceOAuthProvider = "oauth_provider"

	ActionOAuthClientsRead   = "clients_read"
	ActionOAuthClientsManage = "clients_manage"
	ActionOAuthKeysRotate    = "keys_rotate"
	ActionOAuthTokensRevoke  = "tokens_revoke"
)

var (
	OAuthClientsRead   = Permission{Resource: ResourceOAuthProvider, Action: ActionOAuthClientsRead}
	OAuthClientsManage = Permission{Resource: ResourceOAuthProvider, Action: ActionOAuthClientsManage}
	OAuthKeysRotate    = Permission{Resource: ResourceOAuthProvider, Action: ActionOAuthKeysRotate}
	OAuthTokensRevoke  = Permission{Resource: ResourceOAuthProvider, Action: ActionOAuthTokensRevoke}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceOAuthProvider,
		LabelKey: "OAuth Provider",
		Actions: []ActionDefinition{
			{Action: ActionOAuthClientsRead, LabelKey: "View OAuth clients", DescriptionKey: "View registered external login clients.", DefaultRoles: []string{BuiltInRoleAdmin}},
			{Action: ActionOAuthClientsManage, LabelKey: "Manage OAuth clients", DescriptionKey: "Create, disable, and rotate external OAuth client credentials."},
			{Action: ActionOAuthKeysRotate, LabelKey: "Rotate OAuth signing keys", DescriptionKey: "Rotate the OpenID Connect signing key used for ID tokens."},
			{Action: ActionOAuthTokensRevoke, LabelKey: "Revoke OAuth tokens", DescriptionKey: "Revoke external OAuth access tokens.", DefaultRoles: []string{BuiltInRoleAdmin}},
		},
	})
}
