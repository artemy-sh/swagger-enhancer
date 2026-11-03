"""Catch clipping, padding and wrong scales before editing the recorded UI."""
import json
import math
import os
from pathlib import Path
import numpy as np
from PIL import Image

out=Path(os.environ.get('DEMO_OUTPUT','demo-output'))
recordings=json.loads((out/'recordings.json').read_text())
report={}
for key,scene in recordings.items():
    for channel in ['main','popupCapture']:
        assert scene[channel]['frames'],(key,channel,'no frames')
        assert all(f['width']>=2880 and f['height']>=1519 for f in scene[channel]['frames']),(key,channel,'low resolution')
    actual=Image.open(scene['main']['frames'][-1]['file']).convert('RGB')
    reference=Image.open(out/f'{key}.png').convert('RGB')
    actual=actual.resize(reference.size,Image.Resampling.LANCZOS)
    error=float(np.mean((np.asarray(actual,dtype=float)-np.asarray(reference,dtype=float))**2))
    psnr=10*math.log10(255**2/max(error,.00001))
    # Full-window comparisons detect padded or partially painted capture
    # surfaces that still report the expected PNG dimensions.
    assert psnr>30,(key,'capture differs from actual page',psnr)
    report[key]={'source_size':[2880,1520],'page_reference_psnr':round(psnr,2),'frames':len(scene['main']['frames'])}
    print(key,'OK',round(psnr,2),'dB')
(out/'capture-quality.json').write_text(json.dumps(report,indent=2))
