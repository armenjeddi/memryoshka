#!/bin/bash
#SBATCH --account=aip-btaati
#SBATCH --gres=gpu:l40s:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=00:45:00
#SBATCH --job-name=mh-demo-ingest
#SBATCH --output=/home/armen/scratch/memryoshka_demo/ingest_%j.out
# Writer inputs for the open-film demo video (one GPU, about 10 minutes). Usage: sbatch tools/ingest_video.sbatch
main() {
  source /project/6101803/armen/envs/qwenvl/bin/activate
  export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
  cd /project/6101803/armen/memryoshka_page
  echo "job $SLURM_JOB_ID on $(hostname) $(date)"; nvidia-smi -L
  python -I tools/ingest_video.py /home/armen/scratch/memryoshka_demo/blender4_1fps.mp4 openfilms blender4
  echo "INGEST DONE $(date)"
}
main "$@"
