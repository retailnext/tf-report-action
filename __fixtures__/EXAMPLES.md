# OpenTofu JSON Lines Formatting Examples

Generated from real OpenTofu outputs using the action code

---

## Example 1: Plan with Changes

Shows resources being created from real OpenTofu output

### Input File 1

`plan-with-changes-real.jsonl` contains 5 JSON lines

### Parsed Statistics 1

- Total messages: 5
- Planned changes: 2
- Diagnostics: 0
- Has errors: false
- Change summary: 2 to add, 0 to change, 0 to remove

### Formatted Output 1

**Plan:** **2** to add :heavy_plus_sign:

<details>
<summary>📋 Planned Changes</summary>

:heavy_plus_sign: **random_pet.server** (create) :heavy_plus_sign:
**random_string.password** (create)

</details>

---

## Example 2: Plan with No Changes

Shows when infrastructure matches configuration

### Input File 2

`plan-no-changes-real.jsonl` contains 3 JSON lines

### Parsed Statistics 2

- Total messages: 3
- Planned changes: 0
- Diagnostics: 0
- Has errors: false
- Change summary: 0 to add, 0 to change, 0 to remove

### Formatted Output 2

**Plan:** No changes.

---

## Example 3: Plan with Errors

Shows configuration errors from real OpenTofu output

### Input File 3

`plan-with-errors-real.jsonl` contains 2 JSON lines

### Parsed Statistics 3

- Total messages: 2
- Planned changes: 0
- Diagnostics: 1
- Has errors: true

### Formatted Output 3

### ❌ Errors

❌ **Reference to undeclared resource**

A managed resource "random_pet" "invalid" has not been declared in the root
module.

📄 `main.tf:15`

```hcl
  value = random_pet.invalid.id
```

---

## Example 4: Apply Success

Shows successful resource creation from real OpenTofu output

### Input File 4

`apply-success-real.jsonl` contains 8 JSON lines

### Parsed Statistics 4

- Total messages: 8
- Planned changes: 1
- Diagnostics: 0
- Has errors: false
- Change summary: 1 to add, 0 to change, 0 to remove

### Formatted Output 4

**Apply:** **1** to add :heavy_plus_sign:

<details>
<summary>📋 Planned Changes</summary>

:heavy_plus_sign: **random_pet.demo** (create)

</details>

---

## Key Features Demonstrated

1. Change summaries displayed prominently outside collapsing sections
1. Emoji annotations for visual clarity (:heavy_plus_sign: :heavy_minus_sign: 🔄
   ±)
1. Diagnostic messages with detailed formatting
1. Progress messages (apply_start, apply_progress, apply_complete) are filtered
   out
1. Falls back to standard formatting when JSON Lines not detected
