import json
import os

data_dir = '/home/ubuntu/aguenatv/data'
persist_dir = '/home/ubuntu/persistent_data'
backup_dir = '/home/ubuntu/aguenatv/data_backup'

all_sources = [
    os.path.join(data_dir, 'local-continue-watching.json'),
    os.path.join(persist_dir, 'local-continue-watching.json'),
    os.path.join(backup_dir, 'local-continue-watching.json'),
]

merged = {}
for path in all_sources:
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                items = json.load(f)
                if isinstance(items, list):
                    for it in items:
                        key = f"{it.get('stream_type')}_{it.get('series_id') or it.get('stream_id')}"
                        if key not in merged:
                            merged[key] = it
                        else:
                            old_date = merged[key].get('last_watched_at', '')
                            new_date = it.get('last_watched_at', '')
                            if new_date > old_date:
                                merged[key] = it
        except Exception as e:
            print(f"Erro lendo {path}: {e}")

final_list = list(merged.values())
for it in final_list:
    it['user_id'] = '00000000-0000-0000-0000-000000000001'

final_list.sort(key=lambda x: x.get('last_watched_at', ''), reverse=True)

for out_dir in [data_dir, persist_dir]:
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'local-continue-watching.json')
    bak_file = os.path.join(out_dir, 'local-continue-watching.bak.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, indent=2, ensure_ascii=False)
    with open(bak_file, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, indent=2, ensure_ascii=False)

print(f"Sucesso: {len(final_list)} itens de Continue Assistindo restaurados com seguranca!")
for i, it in enumerate(final_list, 1):
    print(f"{i:2d}. [{it.get('stream_type')}] {it.get('title')} (ep: {it.get('episode_num')}, progress: {it.get('progress_percentage')}%, date: {it.get('last_watched_at')})")
