"""Responsibility: Define stable vocabulary entries for interpretation clients.

Context: API callers use this boundary without depending on parser storage or normalization details.
"""


class Vocabulary:
    """Provide normalized terms used by interpretation clients.

    This type owns vocabulary shape while parsers remain responsible for extracting terms.
    """

    def terms(self):
        """Return the normalized terms currently available to the caller."""
        return []
