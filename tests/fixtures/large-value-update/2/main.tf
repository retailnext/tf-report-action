# Fixture: large-value-update
# Stage 2: ca_bundle changed to a different certificate (rotated CA).
# Exercises the two-sided large value diff path (before=large, after=large)
# where most lines differ.

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
  ca_bundle    = <<-EOT
    -----BEGIN CERTIFICATE-----
    MIIBzTCCAXOgAwIBAgIUcm90YXRlZC13ZWJob29rLWNhLWZha2UwCgYIKoZIzj0E
    AwMwIjEgMB4GA1UEAxMXZml4dHVyZS13ZWJob29rLWNhLXYyMB4XDTI3MDEwMTAw
    MDAwMFoXDTI4MDEwMTAwMDAwMFowIjEgMB4GA1UEAxMXZml4dHVyZS13ZWJob29r
    LWNhLXYyMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEQkJCQkJCQkJCQkJCQkJCQkJC
    QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJC
    QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCo0IwQDAOBgNVHQ8BAf8EBAMC
    AqQwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUZmFrZS1jYS1maW5nZXJwcmlu
    dC0yMB0wCgYIKoZIzj0EAwMDaAAwZQIxAFJvdGF0ZWQtY2VydGlmaWNhdGUtZm9y
    LXRlc3RpbmctcHVycG9zZXMtb25seQIwTm90LWEtcmVhbC1zaWduYXR1cmUtdjI=
    -----END CERTIFICATE-----
  EOT
}
