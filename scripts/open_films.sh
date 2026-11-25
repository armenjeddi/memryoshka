#!/bin/bash
# Build the demo stream: four Blender open films played back to back at one frame per second (47 min 52 s).
# Films (c) Blender Foundation, CC BY (Tears of Steel: CC BY 3.0; see copyright.txt). About 2.4 GB of downloads.
# usage: scripts/open_films.sh [output folder]      -> <folder>/open_films_1fps.mp4   (needs curl and ffmpeg)
set -e
OUT=${1:-data/open_films}
mkdir -p "$OUT/films"
cd "$OUT/films"
fetch() { [ -s "$2" ] || curl -sL --retry 3 -o "$2" "$1"; }
fetch https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov.zip bbb_720p.mov.zip &
fetch https://download.blender.org/durian/movies/Sintel.2010.1080p.mkv sintel_1080p.mkv &
fetch https://download.blender.org/ED/ED_1024.avi elephants_dream_1024.avi &
fetch https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov tears_of_steel_720p.mov &
fetch https://download.blender.org/demo/movies/ToS/copyright.txt copyright.txt &
wait
[ -s big_buck_bunny_720p_h264.mov ] || unzip -oq bbb_720p.mov.zip
F="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1"
ffmpeg -v error -y -threads 4 \
  -i big_buck_bunny_720p_h264.mov -i sintel_1080p.mkv -i elephants_dream_1024.avi -i tears_of_steel_720p.mov \
  -filter_complex "[0:v]fps=1,$F[a];[1:v]fps=1,$F[b];[2:v]fps=1,$F[c];[3:v]fps=1,$F[d];[a][b][c][d]concat=n=4:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 18 -preset medium -g 1 -pix_fmt yuv420p ../open_films_1fps.mp4
echo "$OUT/open_films_1fps.mp4"
