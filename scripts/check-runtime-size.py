"""Measure dependency/source files separately from static OCR assets.

This is a pre-deploy budget check, not a replacement for Vercel's final bundle
measurement, which also includes its generated handler and runtime files.
"""

import argparse
import json
from pathlib import Path
import sysconfig


def directory_size(directory):
    return sum(path.stat().st_size for path in directory.rglob('*') if path.is_file())


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-packages',type=Path,default=Path(sysconfig.get_paths()['purelib']))
    parser.add_argument('--max-mb',type=float,default=350,
                        help='Budget below Vercel\'s 500 MB ceiling, reserving runtime headroom.')
    args=parser.parse_args()
    if not args.site_packages.is_dir():
        parser.error('The site-packages directory does not exist.')
    root=Path(__file__).resolve().parents[1]
    dependencies=directory_size(args.site_packages)
    source=sum(directory_size(root / name) for name in ('api','server','packages/markitdown/src'))
    total=dependencies+source
    print(json.dumps({'dependency_mb':round(dependencies/1_000_000,2),
                      'application_source_mb':round(source/1_000_000,2),
                      'measured_mb':round(total/1_000_000,2),
                      'budget_mb':args.max_mb},indent=2))
    if any(args.site_packages.glob('onnxruntime*')) or any(args.site_packages.glob('magika*')):
        raise SystemExit('Unexpected ML detector dependencies: use the web requirements.txt.')
    if total>args.max_mb*1_000_000:
        raise SystemExit('Python dependencies/source exceed the pre-deploy size budget.')


if __name__=='__main__':
    main()
