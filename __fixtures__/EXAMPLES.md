# OpenTofu JSON Lines Formatting Examples

**Generated from real OpenTofu outputs using the action code**

---

## Plan with Changes

Shows resources being created from real OpenTofu output

### Input File

`plan-with-changes-real.jsonl` (5 JSON lines)

### Parsed Statistics

- Total messages: 5
- Planned changes: 2
- Diagnostics: 0
- Has errors: false
- Change summary: 2 to add, 0 to change, 0 to remove

### Formatted Output

**Plan:** **2** to add :heavy_plus_sign:

<details>
<summary>📋 Planned Changes</summary>

:heavy_plus_sign: **random_pet.server** (create) :heavy_plus_sign:
**random_string.password** (create)

</details>

---

## Plan with No Changes

Shows when infrastructure matches configuration

### Input File

`plan-no-changes-real.jsonl` (3 JSON lines)

### Parsed Statistics

- Total messages: 3
- Planned changes: 0
- Diagnostics: 0
- Has errors: false
- Change summary: 0 to add, 0 to change, 0 to remove

### Formatted Output

**Plan:** No changes.

---

## Plan with Errors

Shows configuration errors from real OpenTofu output

### Input File

`plan-with-errors-real.jsonl` (2 JSON lines)

### Parsed Statistics

- Total messages: 2
- Planned changes: 0
- Diagnostics: 1
- Has errors: true

### Formatted Output

### ❌ Errors

❌ **Reference to undeclared resource**

A managed resource "random_pet" "invalid" has not been declared in the root
module.

📄 `main.tf:15`

```hcl
  value = random_pet.invalid.id
```

---

## Apply Success

Shows successful resource creation from real OpenTofu output

### Input File

`apply-success-real.jsonl` (8 JSON lines)

### Parsed Statistics

- Total messages: 8
- Planned changes: 1
- Diagnostics: 0
- Has errors: false
- Change summary: 1 to add, 0 to change, 0 to remove

### Formatted Output

**Apply:** **1** to add :heavy_plus_sign:

<details>
<summary>📋 Planned Changes</summary>

:heavy_plus_sign: **random_pet.demo** (create)

</details>

---

## Key Features Demonstrated

1. Change summaries displayed prominently outside collapsing sections
2. Emoji annotations for visual clarity (:heavy_plus_sign: :heavy_minus_sign: 🔄
   ±)
3. Diagnostic messages with detailed formatting
4. Progress messages (apply_start, apply_progress, apply_complete) are filtered
   out
5. Falls back to standard formatting when JSON Lines not detected
