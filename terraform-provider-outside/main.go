package main

import (
  "context"
  "log"
  "github.com/hashicorp/terraform-plugin-framework/providerserver"
  "github.com/domcolelak/terraform-provider-outside/internal/provider"
)

var version = "dev"
func main() { opts := providerserver.ServeOpts{Address: "registry.terraform.io/outside/outside", Debug: false}; if err := providerserver.Serve(context.Background(), provider.New(version), opts); err != nil { log.Fatal(err) } }
