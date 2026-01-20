# JSON Lines Parsing Examples

This directory contains examples showing how the action formats OpenTofu JSON
Lines output into rich, readable GitHub PR comments.

## Example 1: Plan with Multiple Changes

### Input JSON Lines

From `tofu plan -json`:

```json
{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"random_pet.server: Plan to create","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:01.234567Z","type":"planned_change","change":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"create"}}
{"@level":"info","@message":"random_string.password: Plan to create","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:01.345678Z","type":"planned_change","change":{"resource":{"addr":"random_string.password","module":"","resource":"random_string.password","implied_provider":"random","resource_type":"random_string","resource_name":"password","resource_key":null},"action":"create"}}
{"@level":"info","@message":"aws_s3_bucket.data: Plan to update in-place","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:01.456789Z","type":"planned_change","change":{"resource":{"addr":"aws_s3_bucket.data","module":"","resource":"aws_s3_bucket.data","implied_provider":"aws","resource_type":"aws_s3_bucket","resource_name":"data","resource_key":null},"action":"update"}}
{"@level":"info","@message":"aws_instance.old: Plan to delete","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:01.567890Z","type":"planned_change","change":{"resource":{"addr":"aws_instance.old","module":"","resource":"aws_instance.old","implied_provider":"aws","resource_type":"aws_instance","resource_name":"old","resource_key":null},"action":"delete"}}
{"@level":"info","@message":"Plan: 2 to add, 1 to change, 1 to destroy.","@module":"tofu.ui","@timestamp":"2024-01-20T10:00:01.678901Z","type":"change_summary","changes":{"add":2,"change":1,"remove":1,"import":0,"operation":"plan"}}
```

### Formatted Comment

<!-- tf-report-action:"production" -->

## ✅ `production` `plan` Succeeded

**Plan:** **2** to add :heavy_plus_sign:, **1** to change 🔄, **1** to remove
:heavy_minus_sign:

<details>
<summary>📋 Planned Changes</summary>

:heavy_plus_sign: **random_pet.server** (create) :heavy_plus_sign:
**random_string.password** (create) 🔄 **aws_s3_bucket.data** (update)
:heavy_minus_sign: **aws_instance.old** (delete)

</details>

---

## Example 2: Apply Success

### Input JSON Lines (Apply)

From `tofu apply -json`:

<!-- markdownlint-disable MD013 -->

```json
{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"random_pet.server: Creating...","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:01.123456Z","type":"apply_start","hook":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"create"}}
{"@level":"info","@message":"random_pet.server: Creation complete after 0s [id=brave-leopard]","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:01.234567Z","type":"apply_complete","hook":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"create","id_key":"id","id_value":"brave-leopard","elapsed_seconds":0}}
{"@level":"info","@message":"random_string.password: Creating...","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:01.345678Z","type":"apply_start","hook":{"resource":{"addr":"random_string.password","module":"","resource":"random_string.password","implied_provider":"random","resource_type":"random_string","resource_name":"password","resource_key":null},"action":"create"}}
{"@level":"info","@message":"random_string.password: Creation complete after 0s [id=none]","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:01.456789Z","type":"apply_complete","hook":{"resource":{"addr":"random_string.password","module":"","resource":"random_string.password","implied_provider":"random","resource_type":"random_string","resource_name":"password","resource_key":null},"action":"create","id_key":"id","id_value":"none","elapsed_seconds":0}}
{"@level":"info","@message":"Apply complete! Resources: 2 added, 0 changed, 0 destroyed.","@module":"tofu.ui","@timestamp":"2024-01-20T10:05:01.567890Z","type":"change_summary","changes":{"add":2,"change":0,"remove":0,"import":0,"operation":"apply"}}
```

<!-- markdownlint-enable MD013 -->

### Formatted Comment (Apply)

<!-- tf-report-action:"production" -->

## ✅ `production` `apply` Succeeded

**Apply:** **2** to add :heavy_plus_sign:

> [!NOTE] Completed successfully with no output.

---

## Example 3: Plan with Errors

### Input JSON Lines (Errors)

From `tofu plan -json`:

<!-- markdownlint-disable MD013 -->

```json
{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-20T10:10:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"error","@message":"Error: Invalid resource type","@module":"tofu.ui","@timestamp":"2024-01-20T10:10:01.123456Z","type":"diagnostic","diagnostic":{"severity":"error","summary":"Invalid resource type","detail":"The provider hashicorp/aws does not support resource type \"aws_invalid_resource\".","range":{"filename":"main.tf","start":{"line":15,"column":1,"byte":234},"end":{"line":15,"column":30,"byte":263}},"snippet":{"context":"resource \"aws_invalid_resource\" \"test\" {","code":"resource \"aws_invalid_resource\" \"test\" {\n  name = \"test\"\n}","start_line":15,"highlight_start_offset":9,"highlight_end_offset":29}}}
{"@level":"error","@message":"Error: Missing required argument","@module":"tofu.ui","@timestamp":"2024-01-20T10:10:01.234567Z","type":"diagnostic","diagnostic":{"severity":"error","summary":"Missing required argument","detail":"The argument \"ami\" is required, but no definition was found.","range":{"filename":"main.tf","start":{"line":25,"column":1,"byte":456},"end":{"line":27,"column":2,"byte":489}}}}
{"@level":"warn","@message":"Warning: Deprecated argument","@module":"tofu.ui","@timestamp":"2024-01-20T10:10:01.345678Z","type":"diagnostic","diagnostic":{"severity":"warning","summary":"Deprecated argument","detail":"The argument \"availability_zone\" is deprecated. Use \"availability_zones\" instead."}}
```

<!-- markdownlint-enable MD013 -->

### Formatted Comment (Errors)

<!-- tf-report-action:"production" -->

#### ❌ `production` `plan` Failed

**Status:** failure

### ❌ Errors

❌ **Invalid resource type**

The provider hashicorp/aws does not support resource type
"aws_invalid_resource".

📄 `main.tf:15`

```hcl
resource "aws_invalid_resource" "test" {
  name = "test"
}
```

❌ **Missing required argument**

The argument "ami" is required, but no definition was found.

📄 `main.tf:25`

### ⚠️ Warnings

⚠️ **Deprecated argument**

The argument "availability_zone" is deprecated. Use "availability_zones"
instead.

---

## Example 4: Plan with Replace

### Input JSON Lines (Replace)

From `tofu plan -json`:

```json
{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-20T10:15:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"aws_instance.web: Plan to replace","@module":"tofu.ui","@timestamp":"2024-01-20T10:15:01.123456Z","type":"planned_change","change":{"resource":{"addr":"aws_instance.web","module":"","resource":"aws_instance.web","implied_provider":"aws","resource_type":"aws_instance","resource_name":"web","resource_key":null},"action":"replace","reason":"cannot_update"}}
{"@level":"info","@message":"aws_db_instance.main: Plan to replace","@module":"tofu.ui","@timestamp":"2024-01-20T10:15:01.234567Z","type":"planned_change","change":{"resource":{"addr":"aws_db_instance.main","module":"","resource":"aws_db_instance.main","implied_provider":"aws","resource_type":"aws_db_instance","resource_name":"main","resource_key":null},"action":"replace","reason":"requested"}}
{"@level":"info","@message":"Plan: 2 to add, 0 to change, 2 to destroy.","@module":"tofu.ui","@timestamp":"2024-01-20T10:15:01.345678Z","type":"change_summary","changes":{"add":2,"change":0,"remove":2,"import":0,"operation":"plan"}}
```

### Formatted Comment (Replace)

<!-- tf-report-action:"production" -->

#### ✅ `production` `plan` Succeeded (Replace)

**Plan:** **2** to add :heavy_plus_sign:, **2** to remove :heavy_minus_sign:

<details>
<summary>📋 Planned Changes</summary>

± **aws_instance.web** (replace) ± **aws_db_instance.main** (replace)

</details>

---

## Example 5: Plan with Drift

### Input JSON Lines (Drift)

From `tofu plan -json`:

```json
{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-20T10:20:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"aws_s3_bucket.logs: Drift detected (update)","@module":"tofu.ui","@timestamp":"2024-01-20T10:20:01.123456Z","type":"resource_drift","change":{"resource":{"addr":"aws_s3_bucket.logs","module":"","resource":"aws_s3_bucket.logs","implied_provider":"aws","resource_type":"aws_s3_bucket","resource_name":"logs","resource_key":null},"action":"update"}}
{"@level":"info","@message":"aws_iam_role.lambda: Drift detected (delete)","@module":"tofu.ui","@timestamp":"2024-01-20T10:20:01.234567Z","type":"resource_drift","change":{"resource":{"addr":"aws_iam_role.lambda","module":"","resource":"aws_iam_role.lambda","implied_provider":"aws","resource_type":"aws_iam_role","resource_name":"lambda","resource_key":null},"action":"delete"}}
{"@level":"info","@message":"aws_s3_bucket.logs: Plan to update in-place","@module":"tofu.ui","@timestamp":"2024-01-20T10:20:01.345678Z","type":"planned_change","change":{"resource":{"addr":"aws_s3_bucket.logs","module":"","resource":"aws_s3_bucket.logs","implied_provider":"aws","resource_type":"aws_s3_bucket","resource_name":"logs","resource_key":null},"action":"update"}}
{"@level":"info","@message":"Plan: 0 to add, 1 to change, 0 to destroy.","@module":"tofu.ui","@timestamp":"2024-01-20T10:20:01.456789Z","type":"change_summary","changes":{"add":0,"change":1,"remove":0,"import":0,"operation":"plan"}}
```

### Formatted Comment (Drift)

<!-- tf-report-action:"production" -->

#### ✅ `production` `plan` Succeeded (Drift)

**Plan:** **1** to change 🔄

<details>
<summary>🔀 Resource Drift</summary>

🔄 **aws_s3_bucket.logs** (update) :heavy_minus_sign: **aws_iam_role.lambda**
(delete)

</details>

<details>
<summary>📋 Planned Changes</summary>

🔄 **aws_s3_bucket.logs** (update)

</details>

---

## Key Features Demonstrated

1. Change summaries are displayed prominently outside of collapsing sections
1. Emoji annotations provide visual cues for different operations
1. Diagnostic messages show errors and warnings with file locations and code
   snippets
1. Resource drift is highlighted separately from planned changes
1. Progress messages (apply_start, apply_progress, apply_complete) are skipped
   to keep comments focused
1. Standard output fallback when JSON lines are not detected
