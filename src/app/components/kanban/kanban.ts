import { Component, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const BASE_API_URL = 'http://localhost:3000/api';

interface Card {
  id?: number;
  title: string;
  position?: number;
  columnId: number;
  editing?: boolean;
  originalTitle?: string; 
}
interface Column { id: number; title: string; position: number; boardId: number; cards: Card[]; }
interface Board { id: number; title: string; columns: Column[]; }

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'kanban',
  templateUrl: './kanban.html',
  styleUrls: ['./kanban.css']
})
export class Kanban implements OnInit {
  board: Board | null = null;
  columns: Column[] = [];
  draggedCard: Card | null = null;

  @ViewChildren('cardInput') cardInputs!: QueryList<ElementRef>;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBoard();
  }

  loadBoard() {
    this.http.get<Board>(`${BASE_API_URL}/boards/1`).subscribe({
      next: (data) => {
        this.board = data;
        this.columns = data.columns.sort((a, b) => a.position - b.position);
        this.columns.forEach(column => {
          column.cards = column.cards.sort((a, b) => a.position! - b.position!);
        });
      },
      error: (error) => {
        console.error('Erro ao carregar o board:', error);
        alert('Erro ao carregar o board. Verifique o console.');
      }
    });
  }

  addCard(column: Column) {
    const newCard: Card = {
      title: 'Nova Tarefa',
      columnId: column.id,
      position: column.cards.length > 0 ? Math.max(...column.cards.map(c => c.position!)) + 1 : 0,
      editing: true
    };

    column.cards.push(newCard);

    this.http.post<Card>(`${BASE_API_URL}/cards`, newCard).subscribe({
      next: (createdCard) => {
        const index = column.cards.indexOf(newCard);
        if (index > -1) {
          column.cards[index].id = createdCard.id;
        }
        setTimeout(() => {
          this.focusCardInput(createdCard.id!);
        });
      },
      error: (error) => {
        console.error('Erro ao adicionar card:', error);
        alert('Erro ao adicionar card. Verifique o console.');
        column.cards = column.cards.filter(c => c !== newCard); 
      }
    });
  }

  editCard(card: Card) {
    card.editing = true;
    card.originalTitle = card.title; 
    setTimeout(() => {
      this.focusCardInput(card.id!);
    });
  }

  focusCardInput(cardId: number) {
    const inputElement = this.cardInputs.find(
      (input) => input.nativeElement.id === 'card-input-' + cardId
    );
    if (inputElement) {
      inputElement.nativeElement.focus();
      inputElement.nativeElement.select();
    } else {
      console.warn('Não foi possível encontrar o input do card para focar:', cardId);
    }
  }

  saveCardEdit(card: Card, newTitle: string) {
    const trimmedTitle = newTitle.trim();

    if (!trimmedTitle && card.id === undefined) {
      this.columns.forEach(col => col.cards = col.cards.filter(c => c !== card));
      card.editing = false;
      return;
    }

    if (!trimmedTitle && card.id !== undefined) {
      alert('O título do card não pode ser vazio. Card revertido.');
      card.title = card.originalTitle || 'Erro de Título'; 
      this.loadBoard(); 
      card.editing = false;
      delete card.originalTitle;
      return;
    }

    if (card.id !== undefined && trimmedTitle === card.originalTitle) {
        card.editing = false;
        delete card.originalTitle;
        return;
    }

    card.title = trimmedTitle;
    card.editing = false;
    delete card.originalTitle;

    if (card.id !== undefined) {
      this.http.put<Card>(`${BASE_API_URL}/cards/${card.id}`, { title: card.title }).subscribe({
        next: (updatedCard) => {
        },
        error: (error) => {
          console.error('Erro ao salvar edição do card:', error);
          alert('Erro ao salvar edição do card. Verifique o console.');
          this.loadBoard(); 
        }
      });
    }
  }

  cancelCardEdit(card: Card) {
    if (card.id === undefined) { 
      this.columns.forEach(col => col.cards = col.cards.filter(c => c !== card));
    } else {
      card.title = card.originalTitle || card.title; 
    }
    card.editing = false;
    delete card.originalTitle;
  }

  handleKeyDown(event: KeyboardEvent, card: Card, inputElement: HTMLInputElement) {
    if (event.key === 'Enter') {
      this.saveCardEdit(card, inputElement.value);
    } else if (event.key === 'Escape') {
      this.cancelCardEdit(card);
    }
  }

  deleteCard(card: Card) {
    if (!card.id) { 
      console.warn('Tentativa de deletar card sem ID.');
      return;
    }
    this.http.delete(`${BASE_API_URL}/cards/${card.id}`).subscribe({
      next: () => {
        this.columns.forEach(column => {
          column.cards = column.cards.filter(c => c.id !== card.id);
        });
      },
      error: (error) => {
        console.error('Erro ao deletar card:', error);
        alert('Erro ao deletar card. Verifique o console.');
      }
    });
  }

  onDragStart(card: Card) {
    this.draggedCard = card;
  }

  onDrop(targetColumn: Column) {
    if (this.draggedCard) {
      const sourceColumn = this.columns.find(col => col.id === this.draggedCard?.columnId);

      if (sourceColumn && sourceColumn.id !== targetColumn.id) {
        sourceColumn.cards = sourceColumn.cards.filter(c => c.id !== this.draggedCard?.id);

        this.draggedCard.columnId = targetColumn.id;
        this.draggedCard.position = targetColumn.cards.length > 0 ? Math.max(...targetColumn.cards.map(c => c.position!)) + 1 : 0;
        targetColumn.cards.push(this.draggedCard);

        this.http.put<Card>(`${BASE_API_URL}/cards/${this.draggedCard.id}/move`, {
          newColumnId: this.draggedCard.columnId,
          newPosition: this.draggedCard.position
        }).subscribe({
          next: (movedCard) => {
            this.columns.forEach(col => {
              col.cards = col.cards.sort((a, b) => a.position! - b.position!);
            });
          },
          error: (error) => {
            console.error('Erro ao mover card:', error);
            alert('Erro ao mover card. Verifique o console.');
            this.loadBoard(); 
          }
        });
      } else if (sourceColumn && sourceColumn.id === targetColumn.id) {
        targetColumn.cards = targetColumn.cards.sort((a, b) => a.position! - b.position!);
      }
      this.draggedCard = null; 
    }
  }

  findCardById(id: number): Card | undefined {
    for (const column of this.columns) {
      const foundCard = column.cards.find(card => card.id === id);
      if (foundCard) {
        return foundCard;
      }
    }
    return undefined;
  }
}