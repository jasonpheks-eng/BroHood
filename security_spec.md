# Security Specification: The Legacy Merch Store

## Data Invariants
1. Global settings can only be read by anyone but written only by authorized admins.
2. Products can be read by anyone but managed (create/update/delete) only by authorized admins.
3. Admin access is determined by checking the `admins` collection for the user's UID.

## The "Dirty Dozen" Payloads

1. **Setting Spoof**: Unauthorized user trying to change the `brandName` via `setDoc`.
2. **Price Poisoning**: Admin trying to set a negative price for a product.
3. **Ghost Field Injection**: Adding an `isAdmin` field to a product document.
4. **ID Hijacking**: Using a 10KB string as a product ID.
5. **Collection Wipe**: Unauthorized user attempting to delete the global settings document.
6. **Product Injection**: Unauthorized user trying to add a new product.
7. **Color Format Bypass**: Setting a non-hex string as `primaryColor`.
8. **State Shortcut**: Changing `createdAt` timestamp on a product.
9. **Role Escalation**: Unauthorized user trying to add themselves to the `admins` collection.
10. **Anonymous Write**: Attempting to add a product without being signed in.
11. **Bulk Scrape Attempt**: Unauthorized user attempting a blanket list query on a restricted collection (if any).
12. **System Field Mutation**: User trying to modify a system-generated field.

## Security Rules Draft (In DRAFT_firestore.rules)
(Generated in the next step)
