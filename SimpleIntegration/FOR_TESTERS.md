# Manual test checklist

Run the demo using the [README commands](../README.md#test-and-demo) and the approved test environment configuration. Record the platform and device used.

- [ ] **Existing Card Payment:** tap **Pay 1 AED using Card**, check the native form opens, then cancel. Dismiss the existing failure alert. Confirm the normal payment flow still works with approved test data.
- [ ] **Open / close / reopen:** tap **Open tokenization**, close with **Continue Shopping**, then reopen. Check that stale errors or results do not remain.
- [ ] **Branding:** repeat with **Default theme** and **Merchant branding**. Check the header, text and button colours. The native Card form follows branding on iOS and uses vendor defaults on Android. After cancelling it, check that the normal Card Payment form uses its default colours.
- [ ] **Skip consent OFF / ON:** with OFF, checkbox starts unchecked and Card / Apple Pay / Google Pay cannot launch. Tap the independently clickable demo Terms link, then accept and launch Card. Close/reopen and confirm acceptance resets. With ON, no consent block or reserved spacing appears and Card opens immediately. Repeat with default and merchant themes.
- [ ] **Recurring consent:** cycle **Consent: Standard / Recurring / Reusable / Missing order**, reopening each time. Check that long text wraps, Recurring and Reusable show their terms reference, and Missing order uses standard copy.
- [ ] **Apple Pay visibility:** on a supported iOS device, check that Apple Pay appears. It should be absent when unsupported.
- [ ] **Native Card open / cancel:** tap **Add Card**, check the secure native form opens, then cancel. Check that tokenization returns and can be closed and reopened.
- [ ] **POC result:** no NI token is created by the demo. Completed Card / Apple Pay screens report `niTokenCreated: false`. If Google Pay is available, its demo save request fails with the could-not-save message. Do not record a completed native screen as successful token creation.

## Limitations

- Real Card token creation is not connected.
- Apple Pay tokenization is pending native work.
- 3DS continuation is pending.
- Android E2E is not verified.

Consent persistence is mocked only. Live backend consent schema is pending; Card persistence also needs native `/cards` integration. Verify the existing **Pay 1 AED using Card** PAYMENT flow still opens. Android runtime checks require a device or emulator with Google Pay support.
