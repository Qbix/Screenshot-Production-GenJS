var stdio = require('stdio');
var Jimp = require('jimp');
var path = require('path')
var fs = require('fs')
var sharp = require('sharp')
const { createCanvas, loadImage } = require('canvas')
const textMetrics = require('text-metrics')
var text2png = require('text2png');

var ops = stdio.getopt({
    'template': {args: 1, mandatory: true, description: 'Full path to template image file'},
    'config': {args: 1, mandatory: true, description: 'Full path to config.json file'},
    'backgroundColor': {args: 1,key: 'background', args: 1, mandatory: true, description: 'Background color in hex'},
    'screenshot': { args: 1,mandatory: true, description: 'Full path to screenshot file'},
    'size': {args: 1,description: 'Output Size. If set will use'},
    'output': { args: 1,mandatory: true, description: 'Full path where to save result'},
    'text': {args: 1,description: 'Text to print on image'},
    'textColor': {args: 1,description: 'Text Color'},
});

main();

async function main() {
    var screenshotPath = ops.screenshot;
    var templatePath = ops.template;
    var backgroundColor = ops.backgroundColor;
    var outputPath = ops.output;
    var outputSize = ops.size;
    var text = undefined;
    if(ops.text != undefined) {
        text = JSON.parse(ops.text);
    }

    // 0. Read config
    var config = require(ops.config);

    var screenW = config.screenshot.width;
    var screenH = config.screenshot.height;
    var screenX = undefined;
    var screenY = undefined;
    var angle = undefined;

    if(config.screenshot.rect != undefined) {
        screenX1 = config.screenshot.rect.x1;
        screenY1 = config.screenshot.rect.y1;
        screenX2 = config.screenshot.rect.x2;
        screenY2 = config.screenshot.rect.y2;
        screenX3 = config.screenshot.rect.x3;
        screenY3 = config.screenshot.rect.y3;
        screenX4 = config.screenshot.rect.x4;
        screenY4 = config.screenshot.rect.y4;

        deltaX = screenX2 - screenX1;// (screenX2 > screenX1) ? screenX2 - screenX1:screenX1 - screenX2;
        deltaY = (screenY1 > screenY2) ? screenY1-screenY2 : screenY2 - screenY1;//(screenY1 < screenY2) ? screenY1 - screenY2:screenY2 - screenY1;
        
        var angleRadian = Math.atan2(deltaY, deltaX);
        angle = angleRadian * 180 / Math.PI

        if(screenY1 < screenY2) {
            angle*=-1;
        }
        
        screenW = Math.sqrt(Math.pow(screenX2 - screenX1,2) + Math.pow(screenY2 - screenY1,2))
        screenH = Math.sqrt(Math.pow(screenX3 - screenX1,2) + Math.pow(screenY3 - screenY1,2))
        
        var smallDiff = 6;
        if(angle != 0) {
            // screenW +=smallDiff;
            // screenH +=smallDiff;
        }

        screenX = screenX1;
        screenY = screenY1;
        
        // angle = parseInt(angle);
        if(angle != 0) {
            if(angle > 0) {
                var diff = screenW*Math.sin(angleRadian);
                // var diff = screenW*Math.sin(angleRadian);
                screenY -= diff;
            } else {
                var diff = screenH*Math.sin(angleRadian);
                // var diff = screenW*Math.cos(angleRadian);
                screenX -= diff;
            }
        }
    } else {
        screenX = config.screenshot.x;
        screenY = config.screenshot.y;
    }


    Jimp.read(screenshotPath)
    // 1. Create thumbnail with screenshot sizes;
    // 2. Filled with backgroundColor
        .then(screenshot=> {
            var width = screenshot.bitmap.width;
            var height = screenshot.bitmap.height;
            if(outputSize != undefined) {
                width = outputSize.split("x")[0];
                height = outputSize.split("x")[1];
            }
            return new Jimp(width, height, backgroundColor)
        })
        // 3. Merge screenshot in right place
        .then(thumbnailImage =>  {
            return Jimp.read(screenshotPath)
                .then(screenshot => {
                    return sharp(screenshotPath)
                    .toBuffer()
                    .then(data => { 
                        return Jimp.read(data).then(
                                screenshot => {
                                    screenshot.resize(screenW, screenH);
                                    // angle = 0;
                                    if(angle != undefined) {
                                        var result = screenshot.rotate(angle, true)
                                    }
                                    
                                    return thumbnailImage.composite(screenshot, screenX, screenY);
                                }
                            )
                    })
                    .catch(err => { console.error(err) }); 
            });
        })
        // 4. Put template over the whole image
        .then(thumbnailWithScreenshotImage => {
            return Jimp.read(templatePath)
                .then(template=> {
                    return thumbnailWithScreenshotImage.composite(template, 0, 0);
                })
        })
        .then(withoutTextImage => {
            if(config.text !== undefined) {
                return Jimp.loadFont(Jimp.FONT_SANS_32_BLACK).then(font => {
                    var promises = [];
                    config.text.forEach(function (textBlock, i) {
                        if(i < text.length) {
                            var textParameter = text[i];
                            var finalText = textParameter.text.replace(/\\n/g, '\n');

                            var canvasView = createCanvas(textBlock.width, textBlock.height)
                            const ctx = canvasView.getContext('2d')
                            var fontSize = 1;
                            var fontFamily = "sans-serif";
                            var fontWeight = "bold";
                            ctx.antialias = 'gray';
                            ctx.font = fontWeight+' '+fontSize+'px '+fontFamily;

                            if(textBlock.size != undefined) {
                                fontSize = textBlock.size;
                            } else {
                                var increaseFontSize = true;
                                var measuredWidth = 0;
                                var texts = finalText.split("\n");
                                var measuredText = finalText;
                                if(texts.length >0) {
                                    measuredText = texts[0];
                                    for(var i=0; i < texts.length; i++) {
                                        if(measuredText.length < texts[i].length) {
                                            measuredText = texts[i];
                                        }
                                    }
                                }

                                console.log(measuredText);
                                while (increaseFontSize) {
                                    measuredWidth = ctx.measureText(measuredText).width;
                                    var height = fontSize*finalText.split("\n").length;
                                    if(measuredWidth > textBlock.width || height >= textBlock.height) {
                                        increaseFontSize = false;
                                        fontSize--
                                    } else {
                                        fontSize++;
                                    }
                                    ctx.font = fontWeight+' '+fontSize+'px '+fontFamily;
                                }
                            }

                            drawText(ctx, finalText, {
                                rect: {
                                    x: 0,
                                    y: 0,
                                    width: textBlock.width,
                                    height: textBlock.height
                                },
                                font: fontFamily,
                                textAlign: textBlock.alignment,
                                textColor: textParameter.textColor,
                                lineHeight: 0,
                                minFontSize: fontSize,
                                maxFontSize: fontSize

                            });

                            promises.push(Jimp.read(canvasView.toBuffer())
                                .then(textImage=> {
                                    withoutTextImage.composite(textImage, textBlock.x, textBlock.y);
                                    return withoutTextImage
                                }));
                        }
                    });

                    return Promise.all(promises)    
                        .then(function(data){
                            if(data.length > 0) {
                                return data[data.length-1];
                            } else {
                                return withoutTextImage;
                            }
                        });
                });
            } else {
                return withoutTextImage;
            }
        })
        // 5. Save to output
        .then(output => {
            output
            .rgba(false)
            .background(0xFFFFFFFF)
            .getBuffer(Jimp.MIME_JPEG, function (err, outputBuffer) {
                Jimp.read(outputBuffer)
                .then(template=> {
                    template.write(outputPath)
                })
                // the image output here will have white background
            });
        });
}

function drawText(ctx, text, opts) {
    // Default options
    if(!opts)
        opts = {}
    if (!opts.font)
        opts.font = 'sans-serif'
    if (typeof opts.stroke == 'undefined')
        opts.stroke = false
    if (typeof opts.verbose == 'undefined')
        opts.verbose = false
    if (!opts.rect)
        opts.rect = {
            x: 0,
            y: 0,
            width: ctx.canvas.width,
            height: ctx.canvas.height
        }
    if (!opts.lineHeight)
        opts.lineHeight = 1.1
    if (!opts.minFontSize)
        opts.minFontSize = 30
    if (!opts.maxFontSize)
        opts.maxFontSize = 100
    // Default log function is console.log - Note: if verbose il false, nothing will be logged anyway
    if (!opts.logFunction)
        opts.logFunction = function(message) { console.log(message) }

    const words = text.split('\n');
    if (opts.verbose) opts.logFunction('Text contains ' + words.length + ' words')
    var lines = []

    // Finds max font size  which can be used to print whole text in opts.rec
    for (var fontSize = opts.minFontSize; fontSize <= opts.maxFontSize; fontSize++) {

        // Line height
        var lineHeight = fontSize;// * opts.lineHeight

        // Set font for testing with measureText()
        ctx.font = " " + fontSize + "px " + opts.font

        // Start
        var x = opts.rect.x
        var y = opts.rect.y + fontSize // It's the bottom line of the letters
        lines = []
        var line = ""

        // Cycles on words
        for (var word of words) {
            measuredWidth = ctx.measureText(word).width;
            if(opts.textAlign == "center") {
                x = (opts.rect.width - measuredWidth)/2
            } else if(opts.textAlign == "left") {
                x = 0;
            } else if(opts.textAlign == "right") {
                x = opts.rect.width - measuredWidth;
            }
            lines.push({ text: word, x: x, y: y })

            y += lineHeight
        }
    }
    ctx.fillStyle = opts.textColor;
    // Print lines
    for (var line of lines) {
        // Fill or stroke
        if (opts.stroke)
            ctx.strokeText(line.text.trim(), line.x, line.y)
        else
            ctx.fillText(line.text.trim(), line.x, line.y)
    }

    // Returns font size
    return fontSize
}
