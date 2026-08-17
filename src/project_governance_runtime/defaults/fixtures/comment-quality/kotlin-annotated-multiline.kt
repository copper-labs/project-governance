// Responsibility: Prove annotated and multiline declarations retain their documentation.
// Context: The governance parser uses this fixture to protect Kotlin declaration attachment.
package fixtures

/**
 * Represent a deprecated vocabulary contract used by compatibility tests.
 *
 * The annotation must not separate this context from the declaration it documents.
 */
@Deprecated("fixture")
public data class AnnotatedVocabulary {
    /** Return all normalized terms available through this compatibility contract. */
    public fun
        terms(): List<String> = emptyList()
}
