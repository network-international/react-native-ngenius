package ae.network;

import org.junit.Test;
import static org.junit.Assert.*;

public class TokenizationCardValidationTest {
    @Test public void checksLuhnWithoutReturningCardData() {
        String fixture = "4" + "111" + "1111" + "1111" + "1111";
        assertTrue(TokenizationCardValidation.validPan(fixture));
        assertFalse(TokenizationCardValidation.validPan(fixture.substring(0, 15) + "2"));
        assertFalse(TokenizationCardValidation.validPan("0000000000000000"));
        assertFalse(TokenizationCardValidation.validPan("invalid"));
    }
    @Test public void validatesExpiryAndProducesTheConfirmedWireFormat() {
        assertEquals("2099-12", TokenizationCardValidation.expiry("12/99"));
        assertEquals("2099-12", TokenizationCardValidation.expiry("2099-12"));
        assertNull(TokenizationCardValidation.expiry("00/99"));
        assertNull(TokenizationCardValidation.expiry("13/99"));
        assertNull(TokenizationCardValidation.expiry("01/20"));
    }
    @Test public void detectsSchemesWithoutGuessingAnUnfinishedMastercardPrefix() {
        assertEquals("Visa", TokenizationCardValidation.scheme("4"));
        assertNull(TokenizationCardValidation.scheme("222"));
        assertNull(TokenizationCardValidation.scheme("2220"));
        assertEquals("Mastercard", TokenizationCardValidation.scheme("2221"));
        assertEquals("Mastercard", TokenizationCardValidation.scheme("2720"));
        assertNull(TokenizationCardValidation.scheme("2721"));
        assertEquals("American Express", TokenizationCardValidation.scheme("37"));
    }
    @Test public void recognizesLocalSchemesAndResolvesDiscoverBeforeUnionPay() {
        assertNull(TokenizationCardValidation.scheme("6690090"));
        assertEquals("Jaywan", TokenizationCardValidation.scheme("66900901"));
        assertEquals("Jaywan", TokenizationCardValidation.scheme("97845001"));
        assertEquals("Visa", TokenizationCardValidation.scheme("40719"));
        assertEquals("mada", TokenizationCardValidation.scheme("407197"));
        assertEquals("mada", TokenizationCardValidation.scheme("513213"));
        assertNull(TokenizationCardValidation.scheme("62123"));
        assertEquals("UnionPay", TokenizationCardValidation.scheme("621234"));
        assertEquals("Discover", TokenizationCardValidation.scheme("622123"));
    }
    @Test public void validatesCvvLengthAndAsciiDigits() {
        assertTrue(TokenizationCardValidation.validCvv("4", "123"));
        assertFalse(TokenizationCardValidation.validCvv("4", "1234"));
        assertFalse(TokenizationCardValidation.validCvv("4", "12a"));
        assertTrue(TokenizationCardValidation.validCvv("37", "1234"));
        assertFalse(TokenizationCardValidation.validCvv("37", "123"));
    }
    @Test public void acceptsOnlyTheSessionCardEndpointForTheGivenReference() {
        String url = "https://sandbox.test/api/outlets/outlet/payment-tokenization-sessions/session-1/cards";
        assertTrue(TokenizationCardValidation.validEndpoint(url, "session-1"));
        assertTrue(TokenizationCardValidation.validEndpoint(url.replace("session-1", "session%3A1"), "session:1"));
        assertFalse(TokenizationCardValidation.validEndpoint(url, "session-2"));
        assertFalse(TokenizationCardValidation.validEndpoint(url, null));
        for (String invalid : new String[]{
            url.replace("https:", "http:"),
            url.replace("https://", "https://user:secret@"),
            url + "?next=secret",
            url + "#secret",
            url.replace("/cards", "/wallets"),
            "https://sandbox.test/api/outlets/outlet/cards"
        }) {
            assertFalse(TokenizationCardValidation.validEndpoint(invalid, "session-1"));
        }
    }
    @Test public void acceptsOnlyTheSupportedUsageTypes() {
        assertTrue(TokenizationCardValidation.validUsageType("ONCE_OFF"));
        assertTrue(TokenizationCardValidation.validUsageType("PERMANENT"));
        assertFalse(TokenizationCardValidation.validUsageType(null));
        assertFalse(TokenizationCardValidation.validUsageType("UNKNOWN"));
    }
}
