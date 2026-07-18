package provider

import (
  "context"
  "os"
  "github.com/hashicorp/terraform-plugin-framework/datasource"
  "github.com/hashicorp/terraform-plugin-framework/provider"
  "github.com/hashicorp/terraform-plugin-framework/provider/schema"
  "github.com/hashicorp/terraform-plugin-framework/resource"
  "github.com/hashicorp/terraform-plugin-framework/schema/validator"
  "github.com/hashicorp/terraform-plugin-framework/types"
  "github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
  "github.com/hashicorp/terraform-plugin-log/tflog"
)
type outsideProvider struct{ version string }
type providerModel struct{ Endpoint types.String `tfsdk:"endpoint"`; Token types.String `tfsdk:"token"`; ProvisioningToken types.String `tfsdk:"provisioning_token"` }
func New(version string) func() provider.Provider{return func()provider.Provider{return &outsideProvider{version:version}}}
func (p *outsideProvider) Metadata(_ context.Context,_ provider.MetadataRequest,res *provider.MetadataResponse){res.TypeName="outside";res.Version=p.version}
func (p *outsideProvider) Schema(_ context.Context,_ provider.SchemaRequest,res *provider.SchemaResponse){res.Schema=schema.Schema{Description:"Manage the isolated OUTSIDE Enterprise control plane.",Attributes:map[string]schema.Attribute{"endpoint":schema.StringAttribute{Optional:true,Description:"OUTSIDE HTTPS API endpoint.",Validators:[]validator.String{stringvalidator.LengthAtLeast(8)}},"token":schema.StringAttribute{Optional:true,Sensitive:true,Description:"Scoped out_enterprise token."},"provisioning_token":schema.StringAttribute{Optional:true,Sensitive:true,Description:"Platform provisioning token, required only for workspace licensing."}}}}
func (p *outsideProvider) Configure(ctx context.Context,req provider.ConfigureRequest,res *provider.ConfigureResponse){var config providerModel;res.Diagnostics.Append(req.Config.Get(ctx,&config)...);if res.Diagnostics.HasError(){return};endpoint:=config.Endpoint.ValueString();if endpoint==""{endpoint=os.Getenv("OUTSIDE_ENDPOINT")};if endpoint==""{endpoint="https://app.outside.example"};token:=config.Token.ValueString();if token==""{token=os.Getenv("OUTSIDE_TOKEN")};provisioning:=config.ProvisioningToken.ValueString();if provisioning==""{provisioning=os.Getenv("OUTSIDE_PROVISIONING_TOKEN")};client,err:=NewClient(endpoint,token,provisioning);if err!=nil{res.Diagnostics.AddError("Invalid OUTSIDE configuration",err.Error());return};tflog.Info(ctx,"Configured OUTSIDE provider",map[string]any{"endpoint":endpoint});res.ResourceData=client;res.DataSourceData=client}
func (p *outsideProvider) Resources(_ context.Context)[]func()resource.Resource{return []func()resource.Resource{NewWorkspaceResource,NewPolicyResource}}
func (p *outsideProvider) DataSources(_ context.Context)[]func()datasource.DataSource{return nil}
var _ provider.Provider=&outsideProvider{}
