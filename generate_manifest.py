import os
import json
import argparse

# Configurações
OMIT_FILES = {
    'generate_manifest.py', 'README.md', '.github', '.git', 'index.html', 'CNAME', 'manifest.json', 'site-src', 'node_modules', 'dist', 'convert_to_webp.py'
}
OMIT_DIRS = {
    '.git', '.github', 'site-src', 'node_modules', 'dist', '__pycache__'
}

def get_file_info(path, relative_path):
    """Retorna metadados do arquivo."""
    try:
        stat = os.stat(path)
        return {
            'name': os.path.basename(path),
            'path': relative_path.replace('\\', '/'),
            'type': 'file',
            'size': stat.st_size,
            # 'mtime': stat.st_mtime
        }
    except Exception as e:
        print(f"Erro ao ler arquivo {path}: {e}")
        return None

def scan_directory(directory, root_dir):
    """Escaneia recursivamente o diretório."""
    items = []

    try:
        with os.scandir(directory) as it:
            for entry in it:
                if entry.name in OMIT_FILES or entry.name in OMIT_DIRS:
                    continue

                relative_path = os.path.relpath(entry.path, root_dir)

                if entry.is_dir():
                    children = scan_directory(entry.path, root_dir)
                    items.append({
                        'name': entry.name,
                        'path': relative_path.replace('\\', '/'),
                        'type': 'directory',
                        'children': children
                    })
                elif entry.is_file():
                    file_info = get_file_info(entry.path, relative_path)
                    if file_info:
                        items.append(file_info)
    except Exception as e:
        print(f"Erro ao acessar diretório {directory}: {e}")

    # Ordenar: diretórios primeiro, depois arquivos alfabeticamente
    return sorted(items, key=lambda x: (x['type'] != 'directory', x['name'].lower()))

def main():
    parser = argparse.ArgumentParser(description="Gera manifest.json para o Fênix Development assets.")
    parser.add_argument('--root', default='.', help='Diretório raiz para escanear')
    parser.add_argument('--output', default='manifest.json', help='Arquivo de saída')

    args = parser.parse_args()

    print(f"Escaneando diretório: {os.path.abspath(args.root)}")

    tree = scan_directory(args.root, args.root)

    manifest = {
        'root': tree,
        'generated_at': os.path.getmtime(args.root) if os.path.exists(args.root) else 0
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"Manifest gerado em: {os.path.abspath(args.output)}")

if __name__ == '__main__':
    main()
