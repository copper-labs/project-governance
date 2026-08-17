// Responsibility: Exercise documented Kotlin types whose modifiers or missing names affect parsing.
// Context: This fixture prevents valid inner, companion, and anonymous declarations from blocking edits.
package fixtures

/**
 * Represent the outer type used to verify an inner declaration.
 *
 * The nested view remains part of this public container contract.
 */
public class Container {
    /**
     * Represent the view bound to one container instance.
     *
     * The inner modifier must not detach this documentation from the type.
     */
    public inner class View
}

/**
 * Represent a type with named and anonymous object expressions.
 *
 * The parser must preserve named public types without inventing anonymous type identities.
 */
public class Widget {
    /**
     * Return an anonymous token without exposing its implementation type.
     *
     * Callers depend on the returned value rather than an invented object name.
     */
    public fun token(): Any = object : Any() {}

    /**
     * Provide named factory behavior for widget callers.
     *
     * The companion modifier must not detach this documentation from Factory.
     */
    public companion object Factory
}

/**
 * Represent a type whose companion has no declared name.
 *
 * The anonymous companion must not acquire a name from a later token.
 */
public class AnonymousCompanionHost {
    companion object {}
}
