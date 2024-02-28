import { Component } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import jsPDF from 'jspdf';
import * as imageprocessor from 'ts-image-processor';
import { IReimbursement } from 'src/domain/reimbursement';
import { ReimbursementService } from 'src/app/reimbursement.service';
import { NgxFileDropEntry } from 'ngx-file-drop';
import { PDFDocument } from 'pdf-lib';
import { ReimbursementValidationService } from 'src/app/reimbursement.validation.service';

@Component({
  selector: 'app-submission-overview',
  templateUrl: './submission-overview.component.html',
  styleUrls: ['./submission-overview.component.css']
})
export class SubmissionOverviewComponent {
  formGroup: FormGroup;

  public files: File[] = [];

  showPdf = false;

  loading = false;

  pdfFullyRendered = () => {
    console.error('pdfFullyRendered not set');
  };
  pdfFullyRenderedPromise: Promise<void> = new Promise(resolve => {
    this.pdfFullyRendered = resolve;
  });

  constructor(
    private readonly router: Router,
    private readonly reimbursementService: ReimbursementService,
    private readonly validationService: ReimbursementValidationService
  ) {
    this.formGroup = reimbursementService.getFormStep('overview');
  }

  get iban() {
    return this.formGroup.get('iban') as FormControl<string>;
  }

  getSum(): number {
    return (
      this.r()?.expenses.reduce(
        (sum, expense) => sum + expense.totalReimbursement(),
        0
      ) || 0
    );
  }

  getErrors(): string[] {
    return this.validationService
      .validateReimbursement(this.r())
      .findings.filter(f => f.type === 'error')
      .map(f => f.message);
  }
  getWarnings(): string[] {
    return this.validationService
      .validateReimbursement(this.r())
      .findings.filter(f => f.type === 'warning')
      .map(f => f.message);
  }
  getInfos(): string[] {
    return this.validationService
      .validateReimbursement(this.r())
      .findings.filter(f => f.type === 'info')
      .map(f => f.message);
  }
  isReimbursementValid(): boolean {
    return this.validationService.validateReimbursement(this.r()).isValid;
  }

  async addImageToPdf(imageFile: File, pdf: jsPDF) {
    const maxWidth = 575;
    const maxHeight = 802;

    const image = await imageprocessor.fileToBase64(imageFile);
    const exifRotated = await imageprocessor.imageProcessor
      .src(image)
      .pipe(imageprocessor.applyExifOrientation());

    const preprocessedImage =
      await imageprocessor.base64ToImgElement(exifRotated);

    let originalHeight = preprocessedImage.height;
    let originalWidth = preprocessedImage.width;

    let finalImageData: string;
    if (originalWidth > originalHeight) {
      //The image is in landscape, lets rotate it to view it larger
      finalImageData = await imageprocessor.imageProcessor
        .src(exifRotated)
        .pipe(
          imageprocessor.rotate({ degree: 90, clockwise: false }),
          imageprocessor.resize({ maxWidth: 1240, maxHeight: 1713 }),
          imageprocessor.sharpen()
        );
      //Swap originalHeight and originalWidth because we rotated by 90 degrees
      const x = originalHeight;
      originalHeight = originalWidth;
      originalWidth = x;
    } else {
      //only resize to 150dpi
      finalImageData = await imageprocessor.imageProcessor
        .src(exifRotated)
        .pipe(
          imageprocessor.resize({ maxWidth: 1240, maxHeight: 1713 }),
          imageprocessor.sharpen()
        );
    }

    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      const aspectRatio = originalWidth / originalHeight;

      if (originalWidth > maxWidth) {
        newWidth = maxWidth;
        newHeight = newWidth / aspectRatio;
      }

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      }
    }

    pdf.addPage();
    pdf.addImage(
      finalImageData,
      10,
      10,
      newWidth,
      newHeight,
      undefined,
      'FAST'
    );
  }

  async addPdfToPdf(pdfFile: File, pdf: PDFDocument) {
    const fileExtension = pdfFile.name.split('.').pop();
    if (fileExtension !== 'pdf') {
      return;
    }
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDocument = await PDFDocument.load(arrayBuffer);
    (await pdf.copyPages(pdfDocument, pdfDocument.getPageIndices())).forEach(
      page => {
        pdf.addPage(page);
      }
    );
  }

  async continue() {
    this.loading = true;
    this.showPdf = true;
    await new Promise(resolve => setTimeout(resolve, 0));
    await this.pdfFullyRenderedPromise;

    const htmlElement = document.getElementById('pdf-container');
    if (!htmlElement || !this.formGroup.valid) {
      this.loading = false;
      this.showPdf = false;
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    const doc = new jsPDF('p', 'pt', [595, 822], true);
    //Add mailto link and logo
    doc.link(170, 57, 70, 10, {
      url: 'mailto:lgs@jdav-bayern.de'
    });

    //add the first page
    await new Promise<void>(resolve =>
      doc
        .html(htmlElement, {
          autoPaging: true
        })
        .finally(() => resolve())
    );
    //doc.addImage(logoBase64, 'JPEG', 374, 57, 164, 85);

    this.showPdf = false;

    // go through files and add image attachments
    for (const file of this.files) {
      const fileExtension = file.name.split('.').pop();
      if (fileExtension && fileExtension !== 'pdf') {
        await this.addImageToPdf(file, doc);
      }
    }

    const arrayBuffer = doc.output('arraybuffer');
    const startPdfDocument = await PDFDocument.load(arrayBuffer);

    const combinedPdfDocument = await PDFDocument.create();
    (
      await combinedPdfDocument.copyPages(
        startPdfDocument,
        startPdfDocument.getPageIndices()
      )
    ).forEach(page => {
      combinedPdfDocument.addPage(page);
    });

    // go through files and add pdf attachments
    for (const file of this.files) {
      const fileExtension = file.name.split('.').pop();
      if (fileExtension && fileExtension === 'pdf') {
        await this.addPdfToPdf(file, combinedPdfDocument);
      }
    }

    const pdfBytes = await combinedPdfDocument.save();
    const file = new Blob([pdfBytes], { type: 'application/ pdf' });
    const fileURL = URL.createObjectURL(file);

    const link = document.createElement('a');
    link.href = fileURL;
    link.download = `fka_${this.r().courseDetails.id}_${this.r().participantDetails.name.split(' ').pop()?.trim()}.pdf`;
    link.click();
    link.remove();
    this.loading = false;
  }

  back() {
    this.router.navigate(['auslagen']);
  }

  fileDropped(files: NgxFileDropEntry[]) {
    for (const droppedFile of files) {
      // Is it a file?
      if (droppedFile.fileEntry.isFile) {
        const fileEntry = droppedFile.fileEntry as FileSystemFileEntry;
        fileEntry.file((file: File) => {
          this.files.push(file);
        });
      }
    }
  }

  removeFile(fileName: string) {
    this.files = this.files.filter(f => f.name !== fileName);
  }

  r(): IReimbursement {
    return this.reimbursementService.getReimbursment();
  }
}