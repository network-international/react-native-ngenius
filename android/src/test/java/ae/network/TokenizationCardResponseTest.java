package ae.network;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.Assert.*;

public class TokenizationCardResponseTest {
    @Test public void readsTheUpdatedListBeyondTheOldSingleTokenLimit() {
        JsonObject response = new JsonObject();
        JsonArray tokens = new JsonArray();
        int tokenCount = 460;
        for (int i = 0; i < tokenCount; i++) {
            JsonObject token = new JsonObject();
            token.addProperty("tokenRef", tokenRef(i));
            token.addProperty("type", "CARD");
            token.addProperty("status", "VERIFIED");

            JsonObject details = new JsonObject();
            details.addProperty("scheme", "VISA");
            details.addProperty("last4", "1111");
            details.addProperty("expiry", "2099-12");
            token.add("cardDetails", details);
            tokens.add(token);
        }
        byte[] validList = tokens.toString().getBytes(StandardCharsets.UTF_8);
        assertTrue(validList.length > 64 * 1024);

        JsonObject firstToken = tokens.get(0).getAsJsonObject();
        firstToken.getAsJsonObject("cardDetails").addProperty("pan", "fixture-only");
        firstToken.addProperty("cvv", "fixture-only");
        response.add("advisedTokens", tokens);
        response.addProperty("private", "fixture-only");

        Map<String, Object> safe = read(response.toString());
        List<?> safeTokens = (List<?>) safe.get("tokens");
        assertEquals(tokenCount, safeTokens.size());
        assertEquals(tokenRef(tokenCount - 1), ((Map<?, ?>) safeTokens.get(tokenCount - 1)).get("tokenRef"));
        Map<?, ?> first = (Map<?, ?>) safeTokens.get(0);
        Map<?, ?> masked = (Map<?, ?>) first.get("cardDetails");
        assertEquals("1111", masked.get("last4"));
        assertFalse(masked.containsKey("pan"));
        assertFalse(first.containsKey("cvv"));
        assertFalse(safe.containsKey("private"));
    }

    @Test public void readsTheSpecificationAddCardResponse() {
        Map<String, Object> safe = read("{\"advisedTokens\":[{\"tokenRef\":\"019a9a25-7e8f-7a90-8b1c-2d3e4f5a6b7c\","
            + "\"type\":\"CARD\",\"status\":\"VERIFIED\",\"usageType\":\"PERMANENT\",\"authType\":\"NON_AUTHENTICATED\","
            + "\"consentStatus\":\"COLLECTED\",\"cardDetails\":{\"scheme\":\"VISA\",\"last4\":\"1111\","
            + "\"expiry\":\"2030-12\",\"cardholderName\":\"John Doe\"}}]}");
        assertFalse(safe.containsKey("advisedTokens"));
        Map<?, ?> token = (Map<?, ?>) ((List<?>) safe.get("tokens")).get(0);
        assertEquals("019a9a25-7e8f-7a90-8b1c-2d3e4f5a6b7c", token.get("tokenRef"));
        assertEquals(4, token.size());
        Map<?, ?> details = (Map<?, ?>) token.get("cardDetails");
        assertEquals("VISA", details.get("scheme"));
        assertEquals("2030-12", details.get("expiry"));
        assertFalse(details.containsKey("cardholderName"));
    }

    @Test public void readsTheEarlierTokensFieldWhenAdvisedTokensIsAbsent() {
        Map<String, Object> safe = read("{\"tokens\":[{\"tokenRef\":\"" + tokenRef(1)
            + "\",\"type\":\"CARD\",\"status\":\"VERIFIED\"}]}");
        assertEquals(tokenRef(1), ((Map<?, ?>) ((List<?>) safe.get("tokens")).get(0)).get("tokenRef"));
    }

    @Test public void prefersAdvisedTokensOverTheEarlierField() {
        Map<String, Object> safe = read("{\"advisedTokens\":[],\"tokens\":[{\"tokenRef\":\"" + tokenRef(1)
            + "\",\"type\":\"CARD\",\"status\":\"VERIFIED\"}]}");
        assertTrue(((List<?>) safe.get("tokens")).isEmpty());
    }

    @Test(expected = JsonParseException.class)
    public void doesNotFallBackWhenAdvisedTokensIsNotAList() {
        read("{\"advisedTokens\":null,\"tokens\":[]}");
    }

    @Test(expected = JsonParseException.class)
    public void rejectsAResponseWithoutTheUpdatedList() {
        read("{\"status\":\"VERIFIED\"}");
    }

    private static String tokenRef(int index) {
        return String.format(Locale.ROOT, "00000000-0000-4000-8000-%012d", index);
    }

    private static Map<String, Object> read(String body) {
        return TokenizationCardResponse.read(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
}
