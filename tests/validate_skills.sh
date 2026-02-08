#!/bin/bash
# Schema validation for OpenClaw skills
# Checks SKILL.md structure and required fields

set -e

SKILLS_DIR="/Users/vidarbrekke/clawd/skills"
FAILED=0

validate_skill() {
    local skill_dir=$1
    local skill_name=$(basename "$skill_dir")
    local errors=0

    echo "🔍 Validating: $skill_name"

    # Check SKILL.md exists
    if [ ! -f "$skill_dir/SKILL.md" ]; then
        echo "  ❌ Missing SKILL.md"
        errors=$((errors + 1))
    else
        echo "  ✅ SKILL.md exists"

        # Check YAML frontmatter has name field
        if ! head -30 "$skill_dir/SKILL.md" | grep -qE "^name:\s*"; then
            echo "  ❌ Missing 'name:' in YAML frontmatter"
            errors=$((errors + 1))
        else
            echo "  ✅ Has 'name:' field"
        fi

        # Check YAML frontmatter has description field
        if ! head -30 "$skill_dir/SKILL.md" | grep -qE "^description:\s*"; then
            echo "  ❌ Missing 'description:' in YAML frontmatter"
            errors=$((errors + 1))
        else
            echo "  ✅ Has 'description:' field"
        fi

        # Check description is not empty (> 20 chars)
        desc_length=$(head -30 "$skill_dir/SKILL.md" | grep -A5 "^description:" | tr -d '\n' | wc -c)
        if [ "$desc_length" -lt 20 ]; then
            echo "  ⚠️  Description seems short ($desc_length chars) - may be truncated"
        else
            echo "  ✅ Description has content"
        fi

        # Check for forbidden extra documentation files
        for bad_file in README.md README readme.md CHANGELOG.md CHANGELOG INSTALL.md INSTALL CONTRIBUTING.md; do
            if [ -f "$skill_dir/$bad_file" ]; then
                echo "  ⚠️  Found extra file: $bad_file (not needed in skills)"
            fi
        done

        # Check for required directories if they exist
        for dir in scripts references assets; do
            if [ -d "$skill_dir/$dir" ]; then
                echo "  📁 Has $dir/ directory"
            fi
        done
    fi

    # Only count errors as failures
    if [ $errors -gt 0 ]; then
        FAILED=$((FAILED + 1))
        echo "  ❌ FAILED with $errors error(s)"
    else
        echo "  ✅ PASSED"
    fi

    echo ""
}

# Main execution
echo "=== Skill Schema Validation ==="
echo "Checking skills in: $SKILLS_DIR"
echo ""

# Validate the 4 newest skills
for skill in create-plan spreadsheet-processing screenshot-capture pdf-processing; do
    if [ -d "$SKILLS_DIR/$skill" ]; then
        validate_skill "$SKILLS_DIR/$skill"
    else
        echo "❌ Skill not found: $skill"
        FAILED=$((FAILED + 1))
    fi
done

# Summary
echo "=== Summary ==="
if [ $FAILED -eq 0 ]; then
    echo "✅ All 4 skills passed validation"
    exit 0
else
    echo "❌ $FAILED skill(s) failed validation"
    exit 1
fi
