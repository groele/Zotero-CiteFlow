#!/usr/bin/env python3
"""Validate or create immutable annotated SemVer release tags."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:alpha|beta|rc)\.[1-9][0-9]*)?\Z')

def valid_tag(tag):
    return isinstance(tag, str) and tag.startswith('v') and bool(VERSION.fullmatch(tag[1:]))

def current_version(root=ROOT):
    versions = []
    for filename in ('package.json', 'manifest.json'):
        path = root / filename
        if path.is_file():
            value = json.loads(path.read_text(encoding='utf-8')).get('version')
            if value and not value.startswith('__'):
                if not VERSION.fullmatch(value):
                    raise ValueError(f'{filename} has an invalid version: {value}')
                versions.append(value)
    if not versions or len(set(versions)) != 1:
        raise ValueError(f'Authoritative version fields disagree: {versions}')
    return versions[0]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()

def check_tag(tag):
    if not valid_tag(tag):
        raise ValueError('Expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-(alpha|beta|rc).N')
    if tag != 'v' + current_version():
        raise ValueError('Tag and authoritative package version disagree')
    if git('cat-file', '-t', 'refs/tags/' + tag) != 'tag':
        raise ValueError('New release tags must be annotated')
    if git('rev-parse', tag + '^{}') != git('rev-parse', 'HEAD'):
        raise ValueError('Release tag must resolve to the checked-out commit')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', help='Validate an existing tag at HEAD')
    parser.add_argument('--create-tag', help='Create a local annotated tag; never push')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        for value in ('v0.0.0', 'v12.6.0', 'v12.6.0-rc.1', 'v1.0.0-alpha.2', 'v1.0.0-beta.1'):
            assert valid_tag(value), value
        for value in ('V12.6.0', '12.6.0', 'v12', 'v12.6', 'v01.2.3', 'v1.2.3-rc.0', 'v1.2.3-rc.01', 'v1.2.3+build', 'refflow-v1.2.3', 'v1.2.3\n', ''):
            assert not valid_tag(value), value
        print('Tag syntax self-test passed')
    version = current_version()
    if args.tag and args.create_tag:
        parser.error('Choose validation or creation')
    if args.create_tag:
        if not valid_tag(args.create_tag) or args.create_tag != 'v' + version:
            raise ValueError('Requested tag must equal the authoritative version')
        if git('status', '--porcelain'):
            raise ValueError('Commit the reviewed release payload before tagging')
        if git('tag', '--list', args.create_tag):
            raise ValueError('Existing tags are immutable; use a new version')
        subprocess.run(['git', '-C', str(ROOT), 'tag', '-a', args.create_tag, '-m', args.create_tag], check=True)
        check_tag(args.create_tag)
    elif args.tag:
        check_tag(args.tag)
    print('Release version valid:', version)

if __name__ == '__main__':
    main()
