#!/usr/bin/env bash
# scripts/generate-fixtures.sh
#
# Generates Terraform/OpenTofu plan and apply outputs for every fixture
# workspace under tests/fixtures/, for both terraform and tofu. Both tools
# are always run — there is no option to generate output for only one tool.
#
# Usage:
#   bash scripts/generate-fixtures.sh                     # all workspaces
#   bash scripts/generate-fixtures.sh --workspace <name>  # single workspace
#
# Prerequisites:
#   Both `terraform` and `tofu` must be on PATH.
#
# Output (per stage):
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/init.jsonl       — init -json (JSON Lines)
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/validate.json    — validate -json (single JSON object)
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/plan-log.jsonl   — plan -json (JSON Lines)
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/plan.json        — show -json tfplan (single JSON object)
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/apply.jsonl      — apply -json (JSON Lines)
#
# Expected failures:
#   A stage directory may contain an `expect-fail` file listing one command
#   name per line (init, validate, plan, apply). If present, the listed
#   commands are expected to exit with a non-zero code. The script aborts if
#   an expected-fail command succeeds or an unexpected command fails. When a
#   prerequisite command fails, dependent commands are skipped:
#     init failure → skip validate, plan, show, apply
#     plan failure → skip show, apply
#     validate failure → does not block plan/apply

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_DIR="$REPO_ROOT/tests/fixtures"
GENERATED_DIR="$FIXTURES_DIR/generated"
TMP_DIR="$FIXTURES_DIR/tmp"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
ONLY_WORKSPACE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      ONLY_WORKSPACE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
for tool in terraform tofu; do
  if ! command -v "$tool" &>/dev/null; then
    echo "Error: '$tool' not found on PATH. Both terraform and tofu are required." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Helper: validate command exit code against expectations
# ---------------------------------------------------------------------------
# Usage: check_exit_code <command_name> <exit_code> <expected_fail>
#   command_name  — human-readable name (init, validate, plan, apply)
#   exit_code     — the exit code from the command
#   expected_fail — "1" if failure is expected, "" otherwise
# Returns 0 on success, 1 on unexpected result (caller should abort).
check_exit_code() {
  local cmd_name="$1"
  local exit_code="$2"
  local expected_fail="$3"

  if [[ $exit_code -ne 0 && -z "$expected_fail" ]]; then
    echo "      ERROR: '$cmd_name' failed unexpectedly (exit code $exit_code)" >&2
    return 1
  fi

  if [[ $exit_code -eq 0 && -n "$expected_fail" ]]; then
    echo "      ERROR: '$cmd_name' was expected to fail but succeeded" >&2
    return 1
  fi

  if [[ $exit_code -ne 0 && -n "$expected_fail" ]]; then
    echo "      ($cmd_name failed as expected, exit code $exit_code)"
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Helper: run one tool against one workspace
# ---------------------------------------------------------------------------
run_tool_workspace() {
  local tool="$1"
  local workspace="$2"
  local workspace_src="$FIXTURES_DIR/$workspace"
  local tool_tmp="$TMP_DIR/$tool/$workspace"

  echo "  [$tool] $workspace"

  # Collect stages in ascending numeric order
  local stages=()
  for stage_dir in "$workspace_src"/*/; do
    stage=$(basename "$stage_dir")
    # Only include numeric stage directories
    if [[ "$stage" =~ ^[0-9]+$ ]]; then
      stages+=("$stage")
    fi
  done
  # Sort numerically
  IFS=$'\n' stages=($(sort -n <<<"${stages[*]}")); unset IFS

  if [[ ${#stages[@]} -eq 0 ]]; then
    echo "    Warning: no numeric stage directories found in $workspace_src" >&2
    return
  fi

  # Fresh temp directory; preserve .terraform/ and state between stages
  rm -rf "$tool_tmp"
  mkdir -p "$tool_tmp"

  for stage in "${stages[@]}"; do
    local stage_src="$workspace_src/$stage"
    local out_dir="$GENERATED_DIR/$tool/$workspace/$stage"

    echo "    stage $stage"

    # Copy .tf files and supporting HCL from stage directory into tmp.
    # Files not present in this stage are carried forward from the previous
    # stage because we never wipe the working directory between stages.
    if [[ -d "$stage_src" ]]; then
      # Copy all files from stage_src into tool_tmp (overwriting changed files).
      # Use rsync if available, fall back to cp.
      if command -v rsync &>/dev/null; then
        rsync -a --exclude='.terraform' --exclude='*.tfstate' \
          --exclude='*.tfstate.backup' --exclude='*.tfplan' \
          --exclude='expect-fail' \
          "$stage_src/" "$tool_tmp/"
      else
        find "$stage_src" -maxdepth 1 -type f ! -name 'expect-fail' | while read -r f; do
          cp "$f" "$tool_tmp/"
        done
        # Also copy subdirectories (e.g. modules/), but not the preserved dirs
        find "$stage_src" -mindepth 1 -maxdepth 1 -type d | while read -r d; do
          dirname_only=$(basename "$d")
          cp -r "$d" "$tool_tmp/$dirname_only"
        done
      fi
    fi

    mkdir -p "$out_dir"

    # Read expect-fail list for this stage (if present).
    # Stored as a colon-delimited string for bash 3 compatibility.
    local expect_fail_list=""
    if [[ -f "$stage_src/expect-fail" ]]; then
      while IFS= read -r cmd_name || [[ -n "$cmd_name" ]]; do
        cmd_name="${cmd_name%%#*}"   # strip comments
        cmd_name="${cmd_name// /}"   # strip whitespace
        [[ -z "$cmd_name" ]] && continue
        expect_fail_list="${expect_fail_list}:${cmd_name}:"
      done < "$stage_src/expect-fail"
    fi

    # Track which commands have failed (to skip dependents)
    local init_ok=true plan_ok=true

    # -- init → init.jsonl --
    local exit_code=0
    if [[ ! -d "$tool_tmp/.terraform" ]]; then
      "$tool" -chdir="$tool_tmp" init -json -input=false -no-color > "$out_dir/init.jsonl" 2>&1 || exit_code=$?
    else
      "$tool" -chdir="$tool_tmp" init -json -upgrade -input=false -no-color > "$out_dir/init.jsonl" 2>&1 || exit_code=$?
    fi
    local ef=""
    [[ "$expect_fail_list" == *":init:"* ]] && ef="1"
    check_exit_code "init" "$exit_code" "$ef" || return 1
    if [[ $exit_code -ne 0 ]]; then
      init_ok=false
      echo "      (skipping validate, plan, show, apply)"
    fi

    # -- validate → validate.json --
    if $init_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" validate -json > "$out_dir/validate.json" 2>&1 || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":validate:"* ]] && ef="1"
      check_exit_code "validate" "$exit_code" "$ef" || return 1
      # validate failure does not block plan/apply
    fi

    # -- plan → plan-log.jsonl + tfplan binary --
    if $init_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" plan -json -out=tfplan -input=false -no-color > "$out_dir/plan-log.jsonl" 2>&1 || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":plan:"* ]] && ef="1"
      check_exit_code "plan" "$exit_code" "$ef" || return 1
      if [[ $exit_code -ne 0 ]]; then
        plan_ok=false
        echo "      (skipping show, apply)"
      fi
    fi

    # -- show → plan.json --
    if $init_ok && $plan_ok; then
      "$tool" -chdir="$tool_tmp" show -json tfplan > "$out_dir/plan.json"
    fi

    # -- apply → apply.jsonl --
    if $init_ok && $plan_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" apply -json -auto-approve tfplan > "$out_dir/apply.jsonl" 2>&1 || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":apply:"* ]] && ef="1"
      check_exit_code "apply" "$exit_code" "$ef" || return 1
    fi

    # Remove the binary plan file (not committed)
    rm -f "$tool_tmp/tfplan"
  done

  # Clean up tmp directory
  rm -rf "$tool_tmp"
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
# Collect workspaces
workspaces=()
if [[ -n "$ONLY_WORKSPACE" ]]; then
  if [[ ! -d "$FIXTURES_DIR/$ONLY_WORKSPACE" ]]; then
    echo "Error: workspace '$ONLY_WORKSPACE' not found under $FIXTURES_DIR" >&2
    exit 1
  fi
  workspaces=("$ONLY_WORKSPACE")
else
  for ws_dir in "$FIXTURES_DIR"/*/; do
    ws=$(basename "$ws_dir")
    if [[ "$ws" != "generated" && "$ws" != "tmp" ]]; then
      workspaces+=("$ws")
    fi
  done
fi

if [[ ${#workspaces[@]} -eq 0 ]]; then
  echo "No workspaces found under $FIXTURES_DIR" >&2
  exit 1
fi

echo "Generating fixture plans for workspaces: ${workspaces[*]}"
echo "Tools: terraform tofu"
echo ""

for workspace in "${workspaces[@]}"; do
  echo "Workspace: $workspace"
  for tool in terraform tofu; do
    run_tool_workspace "$tool" "$workspace"
  done
  echo ""
done

echo "Done. Generated files are under $GENERATED_DIR"
