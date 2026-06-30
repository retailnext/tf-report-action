# Fixture: addressless-plan-error
#
# What it exercises: failure-driven causal log focusing for a failed `plan`
# step whose only concern is an ADDRESSLESS config-evaluation error
# (`Invalid index`) emitted alongside many unrelated `refresh_*` hooks.
#
# Why it was created: reproduces a real report where a single addressless
# `Invalid index` error was buried under hundreds of refresh-hook log lines
# for resources unrelated to the failure. The focusing filter must drop every
# unrelated refresh hook (plus structural version/change_summary/outputs lines)
# and surface only the diagnostic, since the error carries a source range but
# no resource address (so address-based filtering alone cannot scope it).
#
# Stage 0: Baseline — create several null_resources so they populate state and
#          emit `refresh_*` hooks on the next plan. Several literal outputs
#          (number, bool, object, multi-line string) are declared so the
#          successful apply exercises output rendering and the next stage's
#          failed-plan JSONL carries `outputs` log lines for the focusing
#          filter to drop.
# Stage 1: Add an output that indexes a map with a key only knowable after
#          refresh, producing an addressless `Invalid index` error at plan time
#          while the stage-0 resources refresh. Plan is expected to fail.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "noise" {
  count = 6

  triggers = {
    index = count.index
  }
}

output "noise_count" {
  value = 6
}

output "noise_enabled" {
  value = true
}

output "noise_config" {
  value = {
    name    = "noise"
    enabled = true
  }
}

output "noise_banner" {
  value = "line one\nline two\nline three\nline four\nline five"
}
