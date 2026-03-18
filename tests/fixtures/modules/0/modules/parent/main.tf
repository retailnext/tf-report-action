# Parent module: receives a count and label, delegates to a child module.

variable "resource_count" {
  type        = number
  description = "Number of resources the child module should create"
}

variable "label" {
  type        = string
  description = "Label passed through to child resources"
}

module "child" {
  source = "./modules/child"

  resource_count = var.resource_count
  label          = var.label
}
