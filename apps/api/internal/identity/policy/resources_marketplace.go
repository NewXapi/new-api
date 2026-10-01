package policy

const (
	ResourceMarketplace = "marketplace"

	ActionMarketplaceReview        = "review"
	ActionMarketplaceUnlist        = "unlist"
	ActionMarketplaceTrade         = "trade"
	ActionMarketplaceAgreement     = "agreement"
	ActionMarketplaceConfiguration = "configuration"
)

var (
	MarketplaceReview        = Permission{Resource: ResourceMarketplace, Action: ActionMarketplaceReview}
	MarketplaceUnlist        = Permission{Resource: ResourceMarketplace, Action: ActionMarketplaceUnlist}
	MarketplaceTrade         = Permission{Resource: ResourceMarketplace, Action: ActionMarketplaceTrade}
	MarketplaceAgreement     = Permission{Resource: ResourceMarketplace, Action: ActionMarketplaceAgreement}
	MarketplaceConfiguration = Permission{Resource: ResourceMarketplace, Action: ActionMarketplaceConfiguration}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceMarketplace,
		LabelKey: "Marketplace",
		Actions: []ActionDefinition{
			{
				Action:         ActionMarketplaceReview,
				LabelKey:       "Review marketplace resources",
				DescriptionKey: "Approve or reject submitted character cards and tutorials.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionMarketplaceUnlist,
				LabelKey:       "Unlist marketplace resources",
				DescriptionKey: "Hide published marketplace resources from public access.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionMarketplaceTrade,
				LabelKey:       "Manage marketplace transactions",
				DescriptionKey: "View and reconcile marketplace orders and settlements.",
			},
			{
				Action:         ActionMarketplaceAgreement,
				LabelKey:       "Manage marketplace agreements",
				DescriptionKey: "Create and version author revenue agreements.",
			},
			{
				Action:         ActionMarketplaceConfiguration,
				LabelKey:       "Configure marketplace",
				DescriptionKey: "Configure upload limits and marketplace defaults.",
			},
		},
	})
}
