# Child module: creates count-repeated null_resource instances.

variable "resource_count" {
  type        = number
  description = "Number of null_resource instances to create"
}

variable "label" {
  type        = string
  description = "Label stored in triggers for visibility in plan output"
}

resource "null_resource" "item" {
  count = var.resource_count

  triggers = {
    label = var.label
    index = tostring(count.index)
  }
}
