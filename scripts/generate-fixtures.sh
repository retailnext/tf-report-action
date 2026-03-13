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
#   tests/fixtures/generated/<tool>/<workspace>/<stage>/
#     init.stdout          — init -json stdout
#     init.stderr          — init -json stderr
#     validate.stdout      — validate -json stdout
#     validate.stderr      — validate -json stderr
#     plan.stdout          — plan -json -detailed-exitcode stdout
#     plan.stderr          — plan -json -detailed-exitcode stderr
#     show-plan.stdout     — show -json tfplan stdout
#     show-plan.stderr     — show -json tfplan stderr
#     apply.stdout         — apply -json stdout
#     apply.stderr         — apply -json stderr
#     steps.json           — steps context (references output files)
#
# Workspace options (via a `workspace.conf` file in the workspace root):
#   no-json=true       — run without -json flag
#   no-detailed-exitcode=true — run plan without -detailed-exitcode
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
check_exit_code() {
  local cmd_name="$1"
  local exit_code="$2"
  local expected_fail="$3"
  local detailed_exitcode="${4:-}"

  # With -detailed-exitcode, exit code 2 means "changes present" (success)
  if [[ "$detailed_exitcode" == "1" && "$exit_code" -eq 2 ]]; then
    echo "      ($cmd_name exit 2 = changes present with -detailed-exitcode)"
    return 0
  fi

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
# Helper: read workspace.conf
# ---------------------------------------------------------------------------
read_workspace_conf() {
  local workspace_src="$1"
  local key="$2"
  local conf_file="$workspace_src/workspace.conf"
  if [[ -f "$conf_file" ]]; then
    grep -E "^${key}=" "$conf_file" 2>/dev/null | cut -d= -f2 | tr -d ' ' || true
  fi
}

# ---------------------------------------------------------------------------
# Helper: map exit code to step outcome
# ---------------------------------------------------------------------------
exit_to_outcome() {
  local exit_code="$1"
  local detailed_exitcode="${2:-}"
  if [[ "$exit_code" -eq 0 ]]; then
    echo "success"
  elif [[ "$detailed_exitcode" == "1" && "$exit_code" -eq 2 ]]; then
    echo "success"
  else
    echo "failure"
  fi
}

# ---------------------------------------------------------------------------
# Helper: build steps.json from individual step files
# ---------------------------------------------------------------------------
# Each step writes a line to $out_dir/.steps_tmp in the format:
#   step_id|outcome|conclusion|exit_code|stdout_file|stderr_file
# This function reads those lines and builds steps.json.
build_steps_json() {
  local out_dir="$1"
  local tmp_file="$out_dir/.steps_tmp"

  if [[ ! -f "$tmp_file" ]]; then
    echo "{}" > "$out_dir/steps.json"
    return
  fi

  local json="{"
  local first=true
  while IFS='|' read -r step_id outcome conclusion exit_code_val stdout_file stderr_file; do
    [[ -z "$step_id" ]] && continue
    if $first; then first=false; else json+=","; fi

    json+="\"${step_id}\":{\"outcome\":\"${outcome}\",\"conclusion\":\"${conclusion}\",\"outputs\":{\"exit_code\":\"${exit_code_val}\""
    if [[ -n "$stdout_file" && -s "$out_dir/$stdout_file" ]]; then
      json+=",\"stdout_file\":\"${stdout_file}\""
    fi
    if [[ -n "$stderr_file" && -s "$out_dir/$stderr_file" ]]; then
      json+=",\"stderr_file\":\"${stderr_file}\""
    fi
    json+="}}"
  done < "$tmp_file"
  json+="}"

  echo "$json" > "$out_dir/steps.json"
  rm -f "$tmp_file"
}

# Helper: record a step result
record_step() {
  local out_dir="$1"
  local step_id="$2"
  local outcome="$3"
  local conclusion="$4"
  local exit_code_val="$5"
  local stdout_file="${6:-}"
  local stderr_file="${7:-}"
  echo "${step_id}|${outcome}|${conclusion}|${exit_code_val}|${stdout_file}|${stderr_file}" >> "$out_dir/.steps_tmp"
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

  # Read workspace options
  local use_json=true
  local use_detailed_exitcode=true
  if [[ "$(read_workspace_conf "$workspace_src" "no-json")" == "true" ]]; then
    use_json=false
  fi
  if [[ "$(read_workspace_conf "$workspace_src" "no-detailed-exitcode")" == "true" ]]; then
    use_detailed_exitcode=false
  fi

  # Collect stages in ascending numeric order
  local stages=()
  for stage_dir in "$workspace_src"/*/; do
    stage=$(basename "$stage_dir")
    if [[ "$stage" =~ ^[0-9]+$ ]]; then
      stages+=("$stage")
    fi
  done
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

    # Copy .tf files from stage directory into tmp
    if [[ -d "$stage_src" ]]; then
      if command -v rsync &>/dev/null; then
        rsync -a --exclude='.terraform' --exclude='*.tfstate' \
          --exclude='*.tfstate.backup' --exclude='*.tfplan' \
          --exclude='expect-fail' --exclude='workspace.conf' \
          "$stage_src/" "$tool_tmp/"
      else
        find "$stage_src" -maxdepth 1 -type f ! -name 'expect-fail' ! -name 'workspace.conf' | while read -r f; do
          cp "$f" "$tool_tmp/"
        done
        find "$stage_src" -mindepth 1 -maxdepth 1 -type d | while read -r d; do
          dirname_only=$(basename "$d")
          cp -r "$d" "$tool_tmp/$dirname_only"
        done
      fi
    fi

    # Clean and recreate output directory to remove stale files from prior runs
    rm -rf "$out_dir"
    mkdir -p "$out_dir"

    # Read expect-fail list
    local expect_fail_list=""
    if [[ -f "$stage_src/expect-fail" ]]; then
      while IFS= read -r cmd_name || [[ -n "$cmd_name" ]]; do
        cmd_name="${cmd_name%%#*}"
        cmd_name="${cmd_name// /}"
        [[ -z "$cmd_name" ]] && continue
        expect_fail_list="${expect_fail_list}:${cmd_name}:"
      done < "$stage_src/expect-fail"
    fi

    local init_ok=true plan_ok=true

    # Clear any previous step data
    rm -f "$out_dir/.steps_tmp"

    # -- init --
    local exit_code=0
    local json_flag=""
    $use_json && json_flag="-json"
    if [[ ! -d "$tool_tmp/.terraform" ]]; then
      "$tool" -chdir="$tool_tmp" init $json_flag -input=false -no-color > "$out_dir/init.stdout" 2> "$out_dir/init.stderr" || exit_code=$?
    else
      "$tool" -chdir="$tool_tmp" init $json_flag -upgrade -input=false -no-color > "$out_dir/init.stdout" 2> "$out_dir/init.stderr" || exit_code=$?
    fi
    local ef=""
    [[ "$expect_fail_list" == *":init:"* ]] && ef="1"
    check_exit_code "init" "$exit_code" "$ef" || return 1
    local outcome; outcome=$(exit_to_outcome "$exit_code")
    record_step "$out_dir" "init" "$outcome" "$outcome" "$exit_code" "init.stdout" "init.stderr"
    if [[ $exit_code -ne 0 ]]; then
      init_ok=false
      echo "      (skipping validate, plan, show, apply)"
    fi

    # -- validate --
    if $init_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" validate $json_flag > "$out_dir/validate.stdout" 2> "$out_dir/validate.stderr" || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":validate:"* ]] && ef="1"
      check_exit_code "validate" "$exit_code" "$ef" || return 1
      outcome=$(exit_to_outcome "$exit_code")
      record_step "$out_dir" "validate" "$outcome" "$outcome" "$exit_code" "validate.stdout" "validate.stderr"
    else
      record_step "$out_dir" "validate" "skipped" "skipped" "0" "" ""
    fi

    # -- plan --
    if $init_ok; then
      exit_code=0
      local plan_flags="$json_flag -out=tfplan -input=false -no-color"
      local is_detailed="0"
      if $use_detailed_exitcode; then
        plan_flags="$plan_flags -detailed-exitcode"
        is_detailed="1"
      fi
      # shellcheck disable=SC2086
      "$tool" -chdir="$tool_tmp" plan $plan_flags > "$out_dir/plan.stdout" 2> "$out_dir/plan.stderr" || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":plan:"* ]] && ef="1"
      check_exit_code "plan" "$exit_code" "$ef" "$is_detailed" || return 1
      outcome=$(exit_to_outcome "$exit_code" "$is_detailed")
      record_step "$out_dir" "plan" "$outcome" "$outcome" "$exit_code" "plan.stdout" "plan.stderr"
      # Plan is a failure if exit code is 1 (or >2 for detailed-exitcode)
      if [[ $exit_code -eq 1 ]] || [[ "$is_detailed" != "1" && $exit_code -ne 0 ]]; then
        plan_ok=false
        echo "      (skipping show, apply)"
      fi
    else
      record_step "$out_dir" "plan" "skipped" "skipped" "0" "" ""
    fi

    # -- show-plan --
    if $init_ok && $plan_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" show -json tfplan > "$out_dir/show-plan.stdout" 2> "$out_dir/show-plan.stderr" || exit_code=$?
      outcome=$(exit_to_outcome "$exit_code")
      record_step "$out_dir" "show-plan" "$outcome" "$outcome" "$exit_code" "show-plan.stdout" "show-plan.stderr"
    else
      record_step "$out_dir" "show-plan" "skipped" "skipped" "0" "" ""
    fi

    # -- apply --
    if $init_ok && $plan_ok; then
      exit_code=0
      "$tool" -chdir="$tool_tmp" apply $json_flag -auto-approve tfplan > "$out_dir/apply.stdout" 2> "$out_dir/apply.stderr" || exit_code=$?
      ef=""
      [[ "$expect_fail_list" == *":apply:"* ]] && ef="1"
      check_exit_code "apply" "$exit_code" "$ef" || return 1
      outcome=$(exit_to_outcome "$exit_code")
      record_step "$out_dir" "apply" "$outcome" "$outcome" "$exit_code" "apply.stdout" "apply.stderr"
    else
      record_step "$out_dir" "apply" "skipped" "skipped" "0" "" ""
    fi

    # Generate steps.json
    build_steps_json "$out_dir"

    # Remove binary plan file and empty stderr files
    rm -f "$tool_tmp/tfplan"
    find "$out_dir" -name '*.stderr' -empty -delete 2>/dev/null || true
  done

  # Clean up tmp directory
  rm -rf "$tool_tmp"
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
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
    if [[ "$ws" != "generated" && "$ws" != "tmp" && "$ws" != "manual" ]]; then
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
