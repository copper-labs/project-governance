"""One owner for exact-byte secret signatures shared by checks and context egress."""

import re

DETECTOR_PATTERNS = {
    "private-key": re.compile(rb"-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----"),
    "aws-secret-access-key": re.compile(
        rb"AWS_SECRET_ACCESS_KEY[\"'\]]{0,2}[ \t]{0,16}"
        rb"(?:[:=][ \t\r\n]{0,16}|[ \t]{1,16})[\"']?[A-Za-z0-9/+=]{40}"
    ),
    "github-token": re.compile(rb"ghp_[A-Za-z0-9]{36}"),
}
CHUNK_BYTES = 64 * 1024
PATTERN_OVERLAP_BYTES = 128
