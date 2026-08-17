// Responsibility: Prove KDoc must attach to the public declaration it describes.
// Context: Generated-target proof rejects comments separated from their declaration by executable code.
package fixtures

/**
 * Describe the public type that appears later in this file.
 *
 * This comment is intentionally attached to the intervening private value instead.
 */
private val attachmentMarker = 1

public class WrongAttachment
