// Responsibility: Define stable vocabulary entries used by interpretation clients.
// Context: This boundary keeps API callers independent from parser storage details.
package fixtures

/**
 * Provide normalized vocabulary entries to interpretation clients.
 *
 * Parsers own extraction while this type owns the stable public vocabulary shape.
 */
public class Vocabulary {
    /** Return the normalized terms currently available to the caller. */
    public fun terms(): List<String> = emptyList()
}
