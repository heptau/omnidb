import os
import markdown
import re

DOCS_DIR = 'docs/en'
OUTPUT_DIR = 'docs/en'

# Ensure output directory exists
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# Template using TABS for indentation
TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>{title} - OmniDB Documentation</title>
	<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
	<nav>
		<h2 style="margin-top:0; border-bottom: none; font-size: 1.5em;">OmniDB Docs</h2>
		<div style="margin-bottom: 20px;"><a href="index.html"><strong>&larr; Back to Index</strong></a></div>
		{nav_links}
	</nav>
	<main>
		{content}
	</main>
</body>
</html>
"""

def get_title_from_filename(filename):
    name = os.path.splitext(filename)[0]
    # Remove leading numbers (01_, 02_)
    return name.replace('_', ' ').title()

def get_files():
    files = [f for f in os.listdir(DOCS_DIR) if f.endswith('.md')]
    files.sort()
    return files

def convert():
    files = get_files()
    nav_links = ""

    file_list = []
    for f in files:
        title = get_title_from_filename(f)
        html_filename = f.replace('.md', '.html')
        file_list.append({'md': f, 'html': html_filename, 'title': title})
        nav_links += f'<a href="{html_filename}">{{class_placeholder}}{title}</a>\n'

    for item in file_list:
        with open(os.path.join(DOCS_DIR, item['md']), 'r') as f:
            text = f.read()
            html_content = markdown.markdown(text, extensions=['fenced_code', 'tables'])

        # Highlight active link
        current_nav = nav_links.replace('{class_placeholder}', '')
        current_nav = current_nav.replace(f'href="{item["html"]}"', f'href="{item["html"]}" class="active"')

        # Indent nav links to match template (2 tabs)
        # Split by newline, add 2 tabs to each line
        indented_nav = '\n'.join(['\t\t' + line for line in current_nav.splitlines() if line.strip()])

        final_html = TEMPLATE.format(
            title=item['title'],
            nav_links=indented_nav,
            content=html_content
        )

        # Ensure final newline
        if not final_html.endswith('\n'):
            final_html += '\n'

        with open(os.path.join(OUTPUT_DIR, item['html']), 'w', encoding='utf-8') as f:
            f.write(final_html)

    if file_list:
        first = file_list[0]
        with open(os.path.join(OUTPUT_DIR, first['html']), 'r', encoding='utf-8') as f:
            content = f.read()

        with open(os.path.join(OUTPUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(content)

    print("Conversion complete.")

if __name__ == "__main__":
    convert()
