#!/usr/bin/env python3
"""
Word Document Accessibility Tool — CLI Entry Point

Usage:
    python main.py input.docx                     # audit + auto-fix → input_accessible.docx
    python main.py input.docx -o output.docx      # custom output path
    python main.py input.docx --audit-only        # no changes, report only
    python main.py input.docx --report report.txt # save report to file
"""

import argparse
import sys
from pathlib import Path
from accessibility_checker import AccessibilityChecker


def main():
    parser = argparse.ArgumentParser(
        prog="word-a11y",
        description="Check and auto-fix Word document accessibility per guidelines."
    )
    parser.add_argument("input",  help="Path to the input .docx file")
    parser.add_argument("-o", "--output", default=None,
                        help="Path for the fixed output .docx (default: <input>_accessible.docx)")
    parser.add_argument("--audit-only", action="store_true",
                        help="Run checks only; do not write a fixed file")
    parser.add_argument("--report", default=None,
                        help="Save the issue report to a text file")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    if input_path.suffix.lower() != ".docx":
        print(f"ERROR: Only .docx files are supported (got '{input_path.suffix}').", file=sys.stderr)
        sys.exit(1)

    auto_fix = not args.audit_only
    checker = AccessibilityChecker(
        input_path=str(input_path),
        output_path=args.output,
        auto_fix=auto_fix,
    )
    issues = checker.run()

    # Optionally save report
    if args.report:
        report_path = Path(args.report)
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"Word Accessibility Report\n")
            f.write(f"Input: {input_path}\n")
            f.write(f"Auto-fix: {auto_fix}\n")
            f.write("=" * 60 + "\n\n")
            for issue in issues:
                status = "FIXED" if issue.fix_applied else "MANUAL"
                f.write(f"[{issue.severity}][{issue.rule_id}][{status}]\n")
                f.write(f"  Location   : {issue.location}\n")
                f.write(f"  Description: {issue.description}\n\n")
        print(f"📄 Report saved to: {report_path}")

    # Exit code: 0 if no errors, 1 if unfixed errors remain
    unfixed_errors = [i for i in issues if i.severity == "ERROR" and not i.fix_applied]
    sys.exit(1 if unfixed_errors else 0)


if __name__ == "__main__":
    main()
