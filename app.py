#!/usr/bin/env python3

import json
import re
import os
import requests
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

from flask import Flask, jsonify, request, send_file, abort, render_template, url_for

app = Flask(__name__)

# ── Konfigurácia ──────────────────────────────────────────────────────────────
SUPA_URL = 'https://bopxedkcjdpeiysqlsmn.supabase.co/rest/v1/games'
SUPA_KEY = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
            '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvcHhlZGtjamRwZWl5c3Fsc21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDE0NDEsImV4cCI6MjA4ODA3NzQ0MX0'
            '.SQxiqUp1VISnCz214Z-z6TH9FH-YXV7fV-Kvj2qJHWE')

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

# ── Logika (nezmenená) ─────────────────────────────────────────────────────────

def compute_badge(game):
    status = game.get('status')
    release_date_str = game.get('release_date')
    crack_date_str = game.get('crack_date')
    today = datetime.now().date()
    try:
        if status == 'cracked':
            if not release_date_str or not crack_date_str:
                return 'CRACKED'
            rel = datetime.strptime(release_date_str, '%Y-%m-%d').date()
            crk = datetime.strptime(crack_date_str, '%Y-%m-%d').date()
            diff = (crk - rel).days
            return f"CRACKED D+{diff}" if diff > 0 else "CRACKED D+0"
        if status == 'hypervisor':
            return 'HYPERVISOR'
        if status == 'unreleased':
            if not release_date_str:
                return 'UPCOMING'
            rel = datetime.strptime(release_date_str, '%Y-%m-%d').date()
            diff = (rel - today).days
            return f"UPCOMING D-{diff}" if diff >= 0 else "UPCOMING"
        if not release_date_str:
            return 'UNCRACKED'
        rel = datetime.strptime(release_date_str, '%Y-%m-%d').date()
        diff = (today - rel).days
        return "UNRELEASED" if diff < 0 else f"UNCRACKED D+{diff}"
    except Exception:
        return "UNKNOWN"


def process_game(p):
    img = p.get('cover_url', '')
    if img and not img.startswith('http'):
        img = f"https://isitcracked.com{img}"
    header_img = p.get('header_url', '')
    if header_img and not header_img.startswith('http'):
        header_img = f"https://isitcracked.com{header_img}"
    elif not header_img:
        header_img = img
    return {
        "id": p.get('id'),
        "title": p.get('title', 'Unknown Title'),
        "images": {"cover": img, "header": header_img},
        "status_info": {
            "is_cracked": p.get('status') == 'cracked',
            "is_upcoming": p.get('status') == 'unreleased',
            "is_hypervisor": p.get('status') == 'hypervisor',
            "badge": compute_badge(p),
        },
        "details": {
            "scene_group": p.get('scene_group', 'NONE'),
            "drm": p.get('drm_protection', 'N/A'),
            "release_date": p.get('release_date', 'TBA'),
            "crack_date": p.get('crack_date', p.get('release_date', 'TBA')),
            "developers": p.get('developers', 'Unknown'),
            "description": p.get('description', ''),
        },
    }


def fetch_games():
    headers = {
        'apikey': SUPA_KEY,
        'Authorization': f'Bearer {SUPA_KEY}',
        'Accept': 'application/json',
    }
    resp = requests.get(
        f"{SUPA_URL}?select=*&order=release_date.desc.nullslast",
        headers=headers, timeout=15,
    )
    resp.raise_for_status()
    output = {"cracked": [], "hypervisor": [], "uncracked": [], "upcoming": []}
    for item in resp.json():
        game = process_game(item)
        if game['status_info']['is_cracked']:
            output['cracked'].append(game)
        elif game['status_info']['is_hypervisor']:
            output['hypervisor'].append(game)
        elif game['status_info']['is_upcoming']:
            output['upcoming'].append(game)
        else:
            output['uncracked'].append(game)

    def parse_date(date_str, default_val):
        try:
            return datetime.strptime(date_str, '%Y-%m-%d')
        except (ValueError, TypeError):
            return default_val

    output['upcoming'].sort(key=lambda x: parse_date(x['details']['release_date'], datetime(9999, 12, 31)))
    output['cracked'].sort(key=lambda x: parse_date(x['details']['crack_date'], datetime(1900, 1, 1)), reverse=True)
    output['hypervisor'].sort(key=lambda x: parse_date(x['details']['crack_date'], datetime(1900, 1, 1)), reverse=True)
    output['uncracked'].sort(key=lambda x: parse_date(x['details']['release_date'], datetime(1900, 1, 1)), reverse=True)
    return output


def steam_find_appid(query):
    url = f'https://store.steampowered.com/api/storesearch/?term={quote_plus(query)}&cc=us&l=en&ignore_preferences=1'
    resp = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()
    items = resp.json().get('items') or []
    if not items:
        raise ValueError('Steam search returned no results')
    return items[0].get('id')


def steam_fetch_details(appid):
    url = f'https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=en&v=1'
    resp = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()
    item = resp.json().get(str(appid))
    if not item or not item.get('success'):
        raise ValueError('Steam app details not available')
    return item['data']


def normalize_steam_data(appid, data):
    def format_requirements(value):
        if isinstance(value, dict):
            parts = []
            if value.get('minimum'):
                parts.append(f"<strong>Minimum</strong><br>{value['minimum']}")
            if value.get('recommended'):
                parts.append(f"<strong>Recommended</strong><br>{value['recommended']}")
            return '<br><br>'.join(parts)
        return value or ''

    platforms = [k.capitalize() for k in ('windows', 'mac', 'linux') if data.get('platforms', {}).get(k)]
    genres = ', '.join(i.get('description') for i in data.get('genres', []) if i.get('description'))
    publishers = ', '.join(data.get('publishers') or [])
    developers = ', '.join(data.get('developers') or [])
    price = 'Free' if data.get('is_free') else ''
    price_overview = data.get('price_overview') or {}
    if not price and price_overview:
        price = price_overview.get('final_formatted') or price_overview.get('initial') or 'Unavailable'
    if not price:
        price = 'Unavailable'
    return {
        'app_id': appid,
        'name': data.get('name'),
        'short_description': data.get('short_description', ''),
        'about_the_game': data.get('about_the_game', ''),
        'detailed_description': data.get('detailed_description', ''),
        'header_image': data.get('header_image'),
        'platforms': ', '.join(platforms) if platforms else 'N/A',
        'genres': genres or 'N/A',
        'publishers': publishers or 'N/A',
        'developers': developers or 'N/A',
        'price': price,
        'steam_url': f'https://store.steampowered.com/app/{appid}',
        'pc_requirements': format_requirements(data.get('pc_requirements')),
        'mac_requirements': format_requirements(data.get('mac_requirements')),
        'linux_requirements': format_requirements(data.get('linux_requirements')),
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    # Flask automaticky hľadá tento súbor v priečinku /templates
    return render_template('index.html')

@app.route('/api/games')
def api_games():
    try:
        data = fetch_games()
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route('/api/steam')
def api_steam():
    query = request.args.get('query', '').strip()
    if not query:
        return jsonify({"error": "Missing query parameter"}), 400
    try:
        appid = steam_find_appid(query)
        data = steam_fetch_details(appid)
        return jsonify(normalize_steam_data(appid, data))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route('/api/youtube')
def api_youtube():
    if not YOUTUBE_API_KEY:
        return jsonify({"error": "API key not configured in HF Settings"}), 500

    query = request.args.get('query', '').strip()
    if not query:
        return jsonify({"error": "Missing query parameter"}), 400
        
    try:
        api_url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": f"{query} gameplay",
            "type": "video",
            "maxResults": 1,
            "key": YOUTUBE_API_KEY
        }

        resp = requests.get(api_url, params=params, timeout=10)
        resp.raise_for_status() 
        data = resp.json()

        if data.get("items"):
            video_id = data["items"][0]["id"]["videoId"]
            return jsonify({"videoId": video_id})
            
        return jsonify({"error": "No video found"}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=8000)