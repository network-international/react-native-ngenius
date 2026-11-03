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
    @Test public void refusesPlainHttpCredentialsRedirectTargetsAndOtherPaths() {
        assertTrue(TokenizationCardValidation.validEndpoint("https://sandbox.test/api/outlets/outlet/cards"));
        for (String invalid : new String[]{"http://sandbox.test/api/outlets/outlet/cards", "https://user:secret@sandbox.test/api/outlets/outlet/cards", "https://sandbox.test/api/outlets/outlet/cards?next=secret", "https://sandbox.test/api/outlets/outlet/wallets", "https://sandbox.test/api/outlets/outlet/cards#secret"}) {
            assertFalse(TokenizationCardValidation.validEndpoint(invalid));
        }
    }
}
