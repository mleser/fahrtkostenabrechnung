import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ICarExpense, IExpense, mapTripToReturn } from 'src/domain/expense';
import { ReimbursementService } from 'src/app/reimbursement.service';
import { MatDialog } from '@angular/material/dialog';
import { AddExpenseModalComponent } from './add-expense-modal/add-expense-modal.component';

@Component({
  selector: 'app-expenses-collection',
  templateUrl: './expenses-collection.component.html',
  styleUrls: ['./expenses-collection.component.css']
})
export class ExpensesCollectionComponent {
  expensesTo: IExpense[] = [];
  expensesFrom: IExpense[] = [];
  expensesAt: IExpense[] = [];
  constructor(
    private readonly router: Router,
    public dialog: MatDialog,
    private readonly reimbursementService: ReimbursementService
  ) {
    reimbursementService
      .getExpenses()
      .forEach(expense => this.addExpense(expense));
  }
  openAddExpenseDialog(direction: 'to' | 'from' | 'at') {
    const dialogRef = this.dialog.open(AddExpenseModalComponent, {
      id: 'add-expense-modal',
      width: 'min(95vw, 700px)'
    });

    const lastExpense = this.getLastExpense(direction);
    const startLocation = lastExpense?.endLocation;
    const carType = this.getCarType();

    dialogRef.componentInstance.direction = direction;
    dialogRef.componentInstance.expense = {
      startLocation,
      ...(carType ? { carType } : {})
    } as IExpense;

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addExpense(result);
        this.storeExpenses();
      }
    });
  }
  getCarType() {
    return (
      this.getAllExpenses().find(expense => 'carType' in expense) as ICarExpense
    )?.carType;
  }
  getLastExpense(direction: 'to' | 'from' | 'at') {
    const lastToExpense = this.expensesTo[this.expensesTo.length - 1];
    if (direction === 'to') {
      return lastToExpense;
    }
    if (direction === 'at') {
      return this.expensesAt[this.expensesAt.length - 1] || lastToExpense;
    }
    return this.expensesFrom[this.expensesFrom.length - 1] || lastToExpense;
  }
  getAllExpenses() {
    return [...this.expensesTo, ...this.expensesAt, ...this.expensesFrom];
  }
  storeExpenses() {
    this.reimbursementService.setExpenses(this.getAllExpenses());
  }
  addExpense(expense: IExpense) {
    switch (expense.direction) {
      case 'from':
        this.expensesFrom.push(expense);
        return;
      case 'to':
        this.expensesTo.push(expense);
        return;
      case 'at':
        this.expensesAt.push(expense);
    }
  }
  editRow(expenseId: number) {
    let collectionRef: IExpense[] | undefined = undefined;
    let index = -1;
    for (const collection of [
      this.expensesTo,
      this.expensesAt,
      this.expensesFrom
    ]) {
      index = collection.findIndex(expense => expense.id === expenseId);
      if (index !== -1) {
        collectionRef = collection;
        break;
      }
    }
    if (!collectionRef || index === -1) {
      return;
    }
    const dialogRef = this.dialog.open(AddExpenseModalComponent, {
      id: 'add-expense-modal',
      width: '80%'
    });
    dialogRef.componentInstance.direction = collectionRef[index].direction;
    dialogRef.componentInstance.expense = collectionRef[index];

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        collectionRef![index] = result;
        this.storeExpenses();
      }
    });
  }
  getSum() {
    const reduceSumTotalReimbursement = (list: IExpense[]) =>
      list.reduce(
        (sum: number, expense: IExpense) => sum + expense.totalReimbursement(),
        0
      );
    return (
      reduceSumTotalReimbursement(this.expensesFrom) +
      reduceSumTotalReimbursement(this.expensesAt) +
      reduceSumTotalReimbursement(this.expensesTo)
    );
  }
  deleteRow(expenseId: number) {
    this.expensesTo = this.expensesTo.filter(
      expense => expense.id !== expenseId
    );
    this.expensesFrom = this.expensesFrom.filter(
      expense => expense.id !== expenseId
    );
    this.expensesAt = this.expensesAt.filter(
      expense => expense.id !== expenseId
    );
    this.storeExpenses();
  }
  continue() {
    this.router.navigate(['zusammenfassen-und-abschicken']);
  }
  back() {
    this.router.navigate(['kurs-und-personen-infos']);
  }
  addReturnTrip() {
    this.expensesFrom = this.expensesTo.map(mapTripToReturn).reverse();
    this.storeExpenses();
  }
}