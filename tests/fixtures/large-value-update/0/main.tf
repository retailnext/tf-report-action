# Fixture: large-value-update
# Exercises one-sided and two-sided diffs of large (multi-line) attribute values.
# Uses tfcoremock to simulate a webhook configuration resource whose ca_bundle
# attribute transitions through null → populated → changed.
#
# Stage 0: Resource created with ca_bundle = null (attribute absent).
# Stage 1: ca_bundle populated with a multi-line PEM certificate (before=null → after=large).
# Stage 2: ca_bundle changed to a different certificate (before=large → after=large).
#
# This fixture was created to cover the rendering path where a large attribute
# has only one side (before or after) present, ensuring the report shows proper
# diff notation (+/- prefixes) rather than a bare code block.

terraform {
  required_providers {
    tfcoremock = {
      source  = "hashicorp/tfcoremock"
      version = "0.1.1"
    }
  }
}

provider "tfcoremock" {
  use_only_state = true
}

resource "tfcoremock_webhook_config" "admission" {
  name         = "admission-webhook"
  endpoint_url = "https://webhook.example.com/validate"
}
