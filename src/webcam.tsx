import * as React from "react";
import {Face} from "./face"
import {Items} from "./items"

export class Webcam extends React.Component {
		private video: HTMLVideoElement = document.createElement('video')
		private raw_canvas: HTMLCanvasElement = document.createElement('canvas')
		private tmp_canvas: HTMLCanvasElement = document.createElement('canvas')
        private canvas = React.createRef<HTMLCanvasElement>()
		private facedetector = new Face()


		private async computeFrame(){
				this.raw_canvas.width = 640
				this.raw_canvas.height = 480
				this.tmp_canvas.width = 640
				this.tmp_canvas.height = 480
				const ctx = this.raw_canvas.getContext('2d')!
				ctx.drawImage(this.video, 0, 0);

				await this.facedetector!.detectFaces(this.raw_canvas, this.tmp_canvas);

                // Resize to full screen
                const real_ctx = this.canvas.current!!.getContext('2d')!;
                const w = this.tmp_canvas.width;
                const h = this.tmp_canvas.height;
                const W = this.canvas.current!!.width;
                const H = this.canvas.current!!.height;
                real_ctx.drawImage(this.tmp_canvas, 0, 0, w, h, 0, 0, W, H)
		}

		private loop(){
				this.computeFrame().then(() => {
						requestAnimationFrame(this.loop.bind(this))
				});
		}

		private start(){
			var that = this
			if (navigator.mediaDevices.getUserMedia) {
			  navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}})
			    .then(function(stream) {
						that.video.srcObject = stream;
						that.video.play().then(() => {
								that.facedetector.loadModel()
                                that.loop()
						}).catch((e) => {
							alert("Error launching webcam " + e)
						});

				}).catch(function(e){
					alert("No webcam detected " + e);
				});
			}
		}

        private resize(){
            if (this.canvas && this.canvas.current){
                this.canvas.current.width = window.innerWidth;
                this.canvas.current.height = window.innerHeight;
            }
		}

		componentDidMount(){
            this.resize()
            window.addEventListener('resize', this.resize.bind(this));
            this.start()
		}

		componentWillUnmount(){
            window.removeEventListener('resize', this.resize.bind(this));
        }

		public render() {
				return (
						<div className="webcam">
										<canvas ref={this.canvas} width="640" height="480"></canvas>
										<Items facedetector={this.facedetector} />
						</div>
						);
		}
}
