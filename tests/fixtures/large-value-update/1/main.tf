# Fixture: large-value-update
# Stage 1: ca_bundle populated with a multi-line PEM certificate.
# Exercises the one-sided large value diff path (before=null, after=large).

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
    MIIB0zCCAXmgAwIBAgIUYWRtaXNzaW9uLXdlYmhvb2stZmFrZTAKBggqhkjOPQQD
    AzAiMSAwHgYDVQQDExdmaXh0dXJlLXdlYmhvb2stY2EtZmFrZTAeFw0yNjAxMDEw
    MDAwMDBaFw0yNzAxMDEwMDAwMDBaMCIxIDAeBgNVBAMTF2ZpeHR1cmUtd2ViaG9v
    ay1jYS1mYWtlMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAABo0IwQDAOBgNVHQ8BAf8EBAMCAqQwDwYDVR0T
    AQH/BAUwAwEB/zAdBgNVHQ4EFgQUZmFrZS1jYS1maW5nZXJwcmludC0xMB0wCgYI
    KoZIzj0EAwMDaAAwZQIxAFRoaXMtaXMtYS1mYWtlLWNlcnRpZmljYXRlLWZvci10
    ZXN0aW5nLXB1cnBvc2VzAjBUaGlzLWlzLW5vdC1hLXJlYWwtc2lnbmF0dXJl
    -----END CERTIFICATE-----
  EOT
}
