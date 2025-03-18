import os

# Define the folder structure for a simple Node.js website
folders = [
    "backend",             # Server-side code (Node.js backend)
    "frontend",            # Client-side code (HTML, CSS, JS)
    "database",            # Database related scripts or config files
    "assets/css",          # CSS files
    "assets/js",           # JavaScript files
    "assets/images",       # Images
    "assets/fonts"         # Font files
]

# Create each folder in the current directory
for folder in folders:
    os.makedirs(folder, exist_ok=True)

# Create a basic README and package.json file
with open("README.md", "w") as f:
    f.write("# My Node.js Website\n\nA simple website project.\n")

with open("package.json", "w") as f:
    f.write(
        '{\n'
        '  "name": "my-website",\n'
        '  "version": "1.0.0",\n'
        '  "main": "backend/app.js",\n'
        '  "scripts": {\n'
        '    "start": "node backend/app.js"\n'
        '  }\n'
        '}\n'
    )

print("Folder structure created successfully!")
